const SECRET_KEY = "abc123";
const SECTION_BUY = "buy";
const SECTION_MASTER = "master";
const CATEGORY_FALLBACK = "Uncategorized";
const MEMO_STORAGE_KEY = "ShoppingListApp:memoItems";

let memoItems = [];
let categoriesLookup = [];
let masterCatalogModal = null;

function ensureNick() {
    let nick = localStorage.getItem("nick");
    if (!nick) {
        nick = prompt("Enter your name") || "anon";
        localStorage.setItem("nick", nick);
    }
    return nick;
}

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

function setupMasterUI() {
    const masterAddModal = getModal("masterAddModal");
    const masterForm = document.getElementById("master-form");
    const search = document.getElementById("master-search");

    search?.addEventListener("input", () => filterMasterItems(search.value.trim().toLowerCase()));

    masterForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const nameInput = document.getElementById("master-item-name");
        const categorySelect = document.getElementById("master-item-category");
        const name = nameInput?.value.trim();
        const categoryId = Number(categorySelect?.value ?? 0);
        if (!name || categoryId <= 0) {
            alert("Please enter item name and category.");
            return;
        }

        const categoryName = getCategoryNameById(categorySelect.value) || CATEGORY_FALLBACK;
        if (isDuplicateMaster(name, categoryName)) {
            alert("Item already exists in master list.");
            return;
        }

        const created = await createMasterItem(name, categoryId);
        if (created) {
            appendMasterItem(created, true);
            moveItemToBuyList(created.id);
            masterAddModal?.hide();
            masterForm.reset();
            updateEmptyPlaceholder(SECTION_MASTER);
        }
    });
}

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

async function handleMasterToggle(item) {
    const itemId = Number(item.dataset.itemId);
    if (!itemId) {
        return;
    }
    const inList = item.dataset.inList === "true";
    const targetAvailability = inList ? true : false;
    await toggleAvailability(itemId, targetAvailability);
}

export async function toggleAvailability(itemId, isAvailable, options = {}) {
    const nick = ensureNick();
    const res = await fetch(`/api/availability/${itemId}?k=${SECRET_KEY}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable, updatedBy: nick })
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

function moveItemToAvailableList(itemId) {
    const listItem = document.querySelector(`li[data-section="buy"][data-linked="true"][data-item-id="${itemId}"]`);
    if (listItem) {
        listItem.remove();
        cleanupEmptyCategoryBlocks(SECTION_BUY);
        updateEmptyPlaceholder(SECTION_BUY);
    }
}

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

function getSectionRoot(section) {
    return section === SECTION_MASTER
        ? document.getElementById("master-modal-body")
        : document.getElementById("tab-buy");
}

function buildCategoriesLookup() {
    const select = document.getElementById("master-item-category");
    if (!select) {
        return [];
    }
    return Array.from(select.options)
        .filter((option) => option.value)
        .map((option) => ({ id: option.value, name: option.textContent || "" }));
}

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

async function createMasterItem(name, categoryId) {
    try {
        const res = await fetch(`/api/items?k=${SECRET_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, categoryId })
        });
        if (res.status === 409) {
            alert("Item already exists in master list.");
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
            updatedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error(error);
        alert("Unexpected error while adding master item.");
        return null;
    }
}

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

function loadMemoItems() {
    try {
        const raw = localStorage.getItem(MEMO_STORAGE_KEY);
        memoItems = raw ? JSON.parse(raw) : [];
    } catch {
        memoItems = [];
    }
}

function saveMemoItems() {
    try {
        localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memoItems));
    } catch {
        // ignore
    }
}

function renderMemoItems() {
    document.querySelectorAll("li[data-section='buy'][data-linked='false']").forEach((node) => node.remove());
    memoItems.forEach((memo) => addMemoItemToDom(memo));
    cleanupEmptyCategoryBlocks(SECTION_BUY);
    updateEmptyPlaceholder(SECTION_BUY);
}

function addMemoItem(memo) {
    if (!memo || !memo.name) {
        return;
    }
    memoItems.push(memo);
    saveMemoItems();
    addMemoItemToDom(memo);
    updateEmptyPlaceholder(SECTION_BUY);
}

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

function getCategoryNameById(categoryId) {
    const lookup = categoriesLookup.find((c) => c.id === String(categoryId));
    return lookup ? lookup.name : "";
}

function normalizeText(value) {
    return (value || "").trim().toLowerCase();
}

function escapeHtml(value) {
    return (value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

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


