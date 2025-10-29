const SECTION_BUY = "buy";
const SECTION_MASTER = "master";
const CATEGORY_FALLBACK = "Uncategorized";
const MEMO_STORAGE_KEY = "ShoppingListApp:memoItems";

let memoItems = [];
let categoriesLookup = [];
let masterCatalogModal = null;
let antiForgeryToken = null;

// Helper that builds Razor handler URLs
function buildHandlerUrl(handler) {
    const base = window.location.pathname || "/";
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}handler=${handler}`;
}

// Reads the anti-forgery token from the hidden input
function getAntiForgeryToken() {
    if (!antiForgeryToken) {
        const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
        antiForgeryToken = tokenInput?.value || "";
    }
    return antiForgeryToken;
}

// Ensures a nickname is stored in localStorage for server calls
function ensureNick() {
    let nick = localStorage.getItem("nick");
    if (!nick) {
        nick = prompt("Enter your name") || "anon";
        localStorage.setItem("nick", nick);
    }
    return nick;
}

// Bootstraps all JavaScript features on the index page
export function initializeIndexPage() {
    masterCatalogModal = getModal("masterCatalogModal");
    const openMasterButton = document.getElementById("open-master-catalog-button");
    if (openMasterButton && !window.bootstrap?.Modal) {
        openMasterButton.addEventListener("click", (event) => {
            event.preventDefault();
            masterCatalogModal?.show();
        });
    }
    categoriesLookup = buildCategoriesLookup();
    setupBuyListUI();
    setupBuyListActions();
    loadMemoItems();
    renderMemoItems();
    setupMasterUI();
    setupMasterInteractions();
    updateEmptyPlaceholder(SECTION_BUY);
    updateEmptyPlaceholder(SECTION_MASTER);
}

// Provides a modal helper that works with or without Bootstrap
function getModal(id) {
    const el = document.getElementById(id);
    if (!el) {
        return null;
    }
    if (window.bootstrap?.Modal) {
        return window.bootstrap.Modal.getOrCreateInstance(el);
    }
    return {
        show() {
            el.classList.add("show");
            el.style.display = "block";
            document.body.classList.add("modal-open");
        },
        hide() {
            el.classList.remove("show");
            el.style.display = "none";
            document.body.classList.remove("modal-open");
        }
    };
}

// Wires the Buy List modal choices and memo form
function setupBuyListUI() {
    const buyModal = getModal("buyAddModal");
    const memoModal = getModal("memoModal");

    document.querySelectorAll("#buyAddModal [data-choice]").forEach((button) => {
        button.addEventListener("click", () => {
            const choice = button.dataset.choice;
            buyModal?.hide();
            if (choice === "list") {
                masterCatalogModal?.show();
                window.setTimeout(() => {
                    document.getElementById("master-search")?.focus();
                }, 150);
            } else if (choice === "memo") {
                memoModal?.show();
                document.getElementById("memo-item-name")?.focus();
            }
        });
    });

    const memoForm = document.getElementById("memo-form");
    memoForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const nameInput = document.getElementById("memo-item-name");
        const name = nameInput?.value.trim();
        if (!name) {
            return;
        }
        addMemoItem({
            id: `memo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name,
            category: CATEGORY_FALLBACK
        });
        memoForm.reset();
        memoModal?.hide();
        updateEmptyPlaceholder(SECTION_BUY);
    });
}

// Handles Buy List checkbox and remove interactions
function setupBuyListActions() {
    const buyRoot = getSectionRoot(SECTION_BUY);
    if (!buyRoot) {
        return;
    }

    buyRoot.addEventListener("change", async (event) => {
        const checkbox = event.target.closest("[data-action='mark-purchased']");
        if (!checkbox) {
            return;
        }
        const item = checkbox.closest("li[data-section='buy']");
        if (!item) {
            return;
        }
        await handleMarkPurchased(item, checkbox.checked);
    });

    buyRoot.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-action='remove-item']");
        if (!removeButton) {
            return;
        }
        const item = removeButton.closest("li[data-section='buy']");
        if (!item) {
            return;
        }
        const linked = item.dataset.linked === "true";
        if (!linked) {
            removeMemoItem(item.dataset.itemId);
        }
    });

    const refreshButton = document.getElementById("buy-refresh-button");
    refreshButton?.addEventListener("click", () => {
        document.querySelectorAll("li[data-section='buy'].completed").forEach((item) => {
            const linked = item.dataset.linked === "true";
            if (linked) {
                item.remove();
            } else {
                removeMemoItem(item.dataset.itemId);
            }
        });
        cleanupEmptyCategoryBlocks(SECTION_BUY);
        updateEmptyPlaceholder(SECTION_BUY);
    });
}

// Reflects purchase checkbox changes to UI and server
async function handleMarkPurchased(item, checked) {
    item.classList.toggle("completed", checked);
    const linked = item.dataset.linked === "true";

    if (linked) {
        const itemId = Number(item.dataset.itemId);
        if (!itemId) {
            return;
        }
        await toggleAvailability(itemId, checked, { skipListSync: true });
    }
}

// Sets up search and creation form inside the Master modal
function setupMasterUI() {
    const masterAddModal = getModal("masterAddModal");
    const masterForm = document.getElementById("master-form");
    const search = document.getElementById("master-search");

    search?.addEventListener("input", () => filterMasterItems(search.value.trim().toLowerCase()));

    masterForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const rawName = formData.get("MasterForm.Name");
        const name = (rawName ?? "").toString().trim();
        const categoryId = Number(formData.get("MasterForm.CategoryId") ?? 0);
        if (!name || categoryId <= 0) {
            alert("Please enter item name and category.");
            return;
        }

        formData.set("MasterForm.Name", name);

        const categoryName = getCategoryNameById(String(categoryId)) || CATEGORY_FALLBACK;
        if (isDuplicateMaster(name, categoryName)) {
            alert("Item already exists in master list.");
            return;
        }

        const created = await createMasterItem(formData, form.getAttribute("action") || buildHandlerUrl("CreateMaster"));
        if (created) {
            appendMasterItem(created, true);
            moveItemToBuyList(created.id);
            masterAddModal?.hide();
            form.reset();
            updateEmptyPlaceholder(SECTION_MASTER);
        }
    });
}

// Watches for toggle clicks within the Master list
function setupMasterInteractions() {
    const container = document.getElementById("master-categories");
    if (!container) {
        return;
    }

    container.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-master-item]");
        if (!item) {
            return;
        }

        if (event.target.closest("[data-action='master-toggle']")) {
            await handleMasterToggle(item);
        }
    });
}

// Sends availability toggles when a master item button is pressed
async function handleMasterToggle(item) {
    const itemId = Number(item.dataset.itemId);
    if (!itemId) {
        return;
    }
    const inList = item.dataset.inList === "true";
    const targetAvailability = inList ? true : false;
    await toggleAvailability(itemId, targetAvailability);
}

// Calls the Razor handler to update stock status and sync UI
export async function toggleAvailability(itemId, isAvailable, options = {}) {
    const nick = ensureNick();
    const headers = { "Content-Type": "application/json" };
    const token = getAntiForgeryToken();
    if (token) {
        headers["RequestVerificationToken"] = token;
    }
    const res = await fetch(buildHandlerUrl("ToggleAvailability"), {
        method: "POST",
        headers,
        body: JSON.stringify({ itemId, isAvailable, updatedBy: nick })
    });

    if (!res.ok) {
        const message = await res.text().catch(() => "");
        alert(message || "Failed to update availability.");
        return null;
    }

    const payload = await res.json();
    applyMasterStateUpdate(payload);

    if (!options.skipListSync) {
        if (isAvailable) {
            moveItemToAvailableList(itemId);
        } else {
            moveItemToBuyList(itemId);
        }
    }

    return payload;
}

// Updates the master list row using the server response
function applyMasterStateUpdate(payload) {
    if (!payload) {
        return;
    }

    const masterItem = document.querySelector(`[data-master-item][data-item-id="${payload.itemId}"]`);
    if (masterItem) {
        const inList = !payload.isAvailable;
        masterItem.dataset.inList = inList.toString();
        if (payload.updatedAt) {
            masterItem.dataset.updated = payload.updatedAt;
            const label = masterItem.querySelector("[data-role='last-updated']");
            if (label) {
                label.textContent = formatDateTime(payload.updatedAt);
            }
        }
        const toggleButton = masterItem.querySelector("[data-action='master-toggle']");
        if (toggleButton) {
            const iconCheck = toggleButton.querySelector(".icon-check-circle");
            const iconPlus = toggleButton.querySelector(".icon-plus-circle");
            iconCheck?.classList.toggle("d-none", !inList);
            iconPlus?.classList.toggle("d-none", inList);
            toggleButton.classList.toggle("is-active", inList);
            toggleButton.setAttribute("aria-pressed", inList ? "true" : "false");
        }
        const hiddenLabel = masterItem.querySelector("[data-action='master-toggle'] .visually-hidden");
        if (hiddenLabel) {
            hiddenLabel.textContent = inList ? "In the list" : "Add to list";
        }
        updateMasterCategoryCount(masterItem.closest("[data-category-block]"));
    }
}

// Inserts a linked master item into the Buy List section
function moveItemToBuyList(itemId) {
    const masterItem = document.querySelector(`[data-master-item][data-item-id="${itemId}"]`);
    if (!masterItem) {
        return;
    }

    const name = masterItem.dataset.itemName || "";
    const category = masterItem.dataset.category || CATEGORY_FALLBACK;
    const block = findOrCreateBuyCategoryBlock(category);
    if (!block) {
        return;
    }

    const list = block.querySelector("ul");
    if (!list) {
        return;
    }

    list.querySelector(`[data-linked="true"][data-item-id="${itemId}"]`)?.remove();

    const element = document.createElement("li");
    element.className = "list-group-item d-flex justify-content-between align-items-center gap-3";
    element.dataset.itemId = String(itemId);
    element.dataset.itemName = name;
    element.dataset.category = category;
    element.dataset.section = SECTION_BUY;
    element.dataset.linked = "true";
    element.innerHTML = `
        <div class="d-flex align-items-center gap-2 flex-grow-1">
            <input class="form-check-input" type="checkbox" data-action="mark-purchased">
            <div class="buy-item-label d-flex align-items-center gap-2">
                <i class="bi bi-link-45deg text-primary" aria-hidden="true"></i>
                <span class="buy-item-text fw-semibold">${escapeHtml(name)}</span>
            </div>
        </div>
    `;

    list.appendChild(element);
    updateEmptyPlaceholder(SECTION_BUY);
}

// Removes a linked item when it becomes available
function moveItemToAvailableList(itemId) {
    const listItem = document.querySelector(`li[data-section="buy"][data-linked="true"][data-item-id="${itemId}"]`);
    if (listItem) {
        listItem.remove();
        cleanupEmptyCategoryBlocks(SECTION_BUY);
        updateEmptyPlaceholder(SECTION_BUY);
    }
}

// Finds or builds the Buy List category container
function findOrCreateBuyCategoryBlock(categoryName) {
    const root = getSectionRoot(SECTION_BUY);
    if (!root) {
        return null;
    }

    const footer = root.querySelector("[data-buy-footer=\"true\"]");
    let container = root.querySelector("[data-buy-container=\"true\"]");
    if (!container) {
        container = document.createElement("div");
        container.dataset.buyContainer = "true";
        if (footer) {
            root.insertBefore(container, footer);
        } else {
            root.appendChild(container);
        }
    } else if (footer) {
        root.insertBefore(container, footer);
    }

    root.querySelectorAll(":scope > [data-section=\"buy\"][data-category-block]").forEach((blockEl) => {
        if (blockEl.parentElement !== container) {
            container.appendChild(blockEl);
        }
    });

    const normalized = categoryName?.trim() || CATEGORY_FALLBACK;
    let block = container.querySelector(`[data-category-block="${cssEscape(normalized)}"][data-section="buy"]`);
    if (!block) {
        block = document.createElement("article");
        block.className = "mb-4";
        block.dataset.categoryBlock = normalized;
        block.dataset.section = SECTION_BUY;

        const list = document.createElement("ul");
        list.className = "list-group shadow-sm";

        const displayName = normalized === CATEGORY_FALLBACK ? "" : normalized;
        if (displayName) {
            const heading = document.createElement("h3");
            heading.className = "h6 text-uppercase text-muted mb-2";
            heading.textContent = displayName;
            block.append(heading);
        }

        block.append(list);
        container.appendChild(block);
    }

    return block;
}

// Finds or builds the Master category container
function findOrCreateMasterCategoryBlock(categoryName) {
    const container = document.getElementById("master-categories");
    if (!container) {
        return null;
    }

    const normalized = categoryName?.trim() || CATEGORY_FALLBACK;
    let block = container.querySelector(`[data-category-block="${cssEscape(normalized)}"][data-section="master"]`);
    if (block) {
        return block;
    }

    block = document.createElement("div");
    block.className = "master-category";
    block.dataset.categoryBlock = normalized;
    block.dataset.section = SECTION_MASTER;

    const list = document.createElement("ul");
    list.className = "list-group shadow-sm";

    const displayName = normalized === CATEGORY_FALLBACK ? "" : normalized;
    if (displayName) {
        const heading = document.createElement("h3");
        heading.className = "h6 text-uppercase text-muted mb-2";
        heading.innerHTML = `${escapeHtml(displayName)} <span class="badge bg-light text-secondary">0</span>`;
        block.append(heading);
    }

    block.append(list);
    container.appendChild(block);
    return block;
}

// Updates the badge showing the number of items per category
function updateMasterCategoryCount(block) {
    if (!block) {
        return;
    }
    const badge = block.querySelector(".badge");
    const count = block.querySelectorAll("[data-master-item]").length;
    if (badge) {
        badge.textContent = String(count);
    }
}

// Removes empty category blocks from a given section
function cleanupEmptyCategoryBlocks(section) {
    const root = getSectionRoot(section);
    if (!root) {
        return;
    }
    const scope = section === SECTION_BUY
        ? root.querySelector("[data-buy-container=\"true\"]") || root
        : root;

    scope.querySelectorAll(`[data-section="${section}"][data-category-block]`).forEach((block) => {
        const list = block.querySelector("ul");
        if (!list || list.children.length === 0) {
            block.remove();
        }
    });
}

// Toggles the empty-state message depending on item count
function updateEmptyPlaceholder(section) {
    const root = getSectionRoot(section);
    if (!root) {
        return;
    }
    const placeholder = root.querySelector("[data-empty-placeholder]");
    if (!placeholder) {
        return;
    }

    const scope = section === SECTION_BUY
        ? root.querySelector("[data-buy-container=\"true\"]") || root
        : root;

    const hasItems = section === SECTION_MASTER
        ? document.querySelectorAll("[data-master-item]").length > 0
        : scope.querySelectorAll("article[data-section='buy'] ul li").length > 0;

    placeholder.style.display = hasItems ? "none" : "";
}

// Returns the root element for the requested section
function getSectionRoot(section) {
    return section === SECTION_MASTER
        ? document.getElementById("master-modal-body")
        : document.getElementById("tab-buy");
}

// Caches category id-to-name pairs for later lookup
function buildCategoriesLookup() {
    const select = document.getElementById("MasterForm_CategoryId");
    if (!select) {
        return [];
    }
    return Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => ({ id: option.value, name: option.textContent || "" }));
}

// Filters master items by free-text search
function filterMasterItems(query) {
    const container = document.getElementById("master-categories");
    if (!container) {
        return;
    }

    container.querySelectorAll("[data-master-item]").forEach((item) => {
        const name = item.dataset.itemName?.toLowerCase() || "";
        const category = item.dataset.category?.toLowerCase() || "";
        const match = !query || name.includes(query) || category.includes(query);
        item.classList.toggle("d-none", !match);
    });

    container.querySelectorAll("[data-category-block]").forEach((block) => {
        const visible = block.querySelectorAll("[data-master-item]:not(.d-none)").length;
        block.classList.toggle("d-none", visible === 0);
        updateMasterCategoryCount(block);
    });

    updateEmptyPlaceholder(SECTION_MASTER);
}

// Submits the master creation form via fetch and returns data
async function createMasterItem(formData, action) {
    try {
        const res = await fetch(action || buildHandlerUrl("CreateMaster"), {
            method: "POST",
            body: formData
        });
        if (res.status === 409) {
            alert("Item already exists in master list.");
            return null;
        }
        if (res.status === 400) {
            const payload = await res.json().catch(() => null);
            const message = payload?.errors?.join("\n") || "Failed to add master item.";
            alert(message);
            return null;
        }
        if (!res.ok) {
            const message = await res.text().catch(() => "");
            alert(message || "Failed to add master item.");
            return null;
        }
        const data = await res.json();
        return {
            id: data.id,
            name: data.name,
            category: data.category,
            updatedAt: data.updatedAt || new Date().toISOString()
        };
    } catch (error) {
        console.error(error);
        alert("Unexpected error while adding master item.");
        return null;
    }
}

// Renders a new master item row in the modal
function appendMasterItem(item, inList) {
    const block = findOrCreateMasterCategoryBlock(item.category || CATEGORY_FALLBACK);
    if (!block) {
        return;
    }
    const list = block.querySelector("ul");
    if (!list) {
        return;
    }

    const element = document.createElement("li");
    element.className = "list-group-item d-flex align-items-center gap-3";
    element.dataset.masterItem = "true";
    element.dataset.itemId = String(item.id);
    element.dataset.itemName = item.name;
    element.dataset.category = item.category || CATEGORY_FALLBACK;
    element.dataset.inList = inList ? "true" : "false";
    element.dataset.updated = item.updatedAt || "";
    element.innerHTML = `
        <button type="button" class="master-toggle ${inList ? "is-active" : ""}" data-action="master-toggle" aria-label="Toggle list state" aria-pressed="${inList ? "true" : "false"}">
            <svg class="icon-check-circle text-primary ${inList ? "" : "d-none"}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.28 5.72a.75.75 0 0 0-1.06-1.06L7 7.94 5.78 6.72a.75.75 0 1 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0z" />
            </svg>
            <svg class="icon-plus-circle text-secondary ${inList ? "d-none" : ""}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm.5 3.5a.5.5 0 0 0-1 0V7H3.5a.5.5 0 0 0 0 1H7v3.5a.5.5 0 0 0 1 0V8h3.5a.5.5 0 0 0 0-1H8.5z" />
            </svg>
            <span class="visually-hidden">${inList ? "In the list" : "Add to list"}</span>
        </button>
        <div class="flex-grow-1 fw-semibold">${escapeHtml(item.name)}</div>
        <span class="text-muted small" data-role="last-updated">${formatDateTime(item.updatedAt)}</span>
    `;

    list.appendChild(element);
    updateMasterCategoryCount(block);
}

// Checks whether a master item already exists by name and category
function isDuplicateMaster(name, categoryName) {
    const normalizedName = normalizeText(name);
    const normalizedCategory = normalizeText(categoryName);
    const items = document.querySelectorAll("[data-master-item]");
    return Array.from(items).some((item) => {
        const itemName = normalizeText(item.dataset.itemName || "");
        const itemCategory = normalizeText(item.dataset.category || CATEGORY_FALLBACK);
        return itemName === normalizedName && itemCategory === normalizedCategory;
    });
}

// Loads memo-only items from localStorage
function loadMemoItems() {
    try {
        const raw = localStorage.getItem(MEMO_STORAGE_KEY);
        memoItems = raw ? JSON.parse(raw) : [];
    } catch {
        memoItems = [];
    }
}

// Persists memo-only items to localStorage
function saveMemoItems() {
    try {
        localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memoItems));
    } catch {
        // ignore
    }
}

// Repaints memo items in the Buy List view
function renderMemoItems() {
    document.querySelectorAll("li[data-section='buy'][data-linked='false']").forEach((node) => node.remove());
    memoItems.forEach((memo) => addMemoItemToDom(memo));
    cleanupEmptyCategoryBlocks(SECTION_BUY);
    updateEmptyPlaceholder(SECTION_BUY);
}

// Adds a memo item to memory and the DOM
function addMemoItem(memo) {
    if (!memo || !memo.name) {
        return;
    }
    memoItems.push(memo);
    saveMemoItems();
    addMemoItemToDom(memo);
    updateEmptyPlaceholder(SECTION_BUY);
}

// Builds the HTML for a memo item in the Buy List
function addMemoItemToDom(memo) {
    const block = findOrCreateBuyCategoryBlock(CATEGORY_FALLBACK);
    if (!block) {
        return;
    }
    const list = block.querySelector("ul");
    if (!list) {
        return;
    }
    const element = document.createElement("li");
    element.className = "list-group-item d-flex justify-content-between align-items-center gap-3";
    element.dataset.itemId = memo.id;
    element.dataset.itemName = memo.name;
    element.dataset.category = CATEGORY_FALLBACK;
    element.dataset.section = SECTION_BUY;
    element.dataset.linked = "false";
    element.innerHTML = `
        <div class="d-flex align-items-center gap-2 flex-grow-1">
            <input class="form-check-input" type="checkbox" data-action="mark-purchased">
            <div class="buy-item-label">
                <span class="buy-item-text fw-semibold">${escapeHtml(memo.name)}</span>
            </div>
        </div>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-action="remove-item">Remove</button>
    `;
    list.appendChild(element);
}

// Removes a memo item from storage and the DOM
function removeMemoItem(id) {
    if (!id) {
        return;
    }
    memoItems = memoItems.filter((memo) => memo.id !== id);
    saveMemoItems();
    document.querySelector(`li[data-section="buy"][data-linked="false"][data-item-id="${cssEscape(id)}"]`)?.remove();
    cleanupEmptyCategoryBlocks(SECTION_BUY);
    updateEmptyPlaceholder(SECTION_BUY);
}

// Resolves a category id to its display name
function getCategoryNameById(categoryId) {
    const lookup = categoriesLookup.find((c) => c.id === String(categoryId));
    return lookup ? lookup.name : "";
}

// Normalises text for case-insensitive comparisons
function normalizeText(value) {
    return (value || "").trim().toLowerCase();
}

// Escapes HTML-sensitive characters in a string
function escapeHtml(value) {
    return (value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Escapes values so they are safe in CSS selectors
function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Formats ISO date strings into a friendly timestamp
function formatDateTime(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}


