const searchForm = document.getElementById("docsSearch");
const searchInput = document.getElementById("docsSearchInput");
const searchSuggestions = document.getElementById("docsSearchSuggestions");
const searchStatus = document.getElementById("docsSearchStatus");

if (searchForm && searchInput && searchSuggestions && searchStatus) {
    const normalize = (value) => value
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const plainText = (element) => {
        const copy = element.cloneNode(true);
        copy.querySelectorAll(".docs-code").forEach((code) => code.remove());
        return copy.textContent.replace(/\s+/g, " ").trim();
    };
    const makePreview = (value) => value.length > 135 ? `${value.slice(0, 132).trimEnd()}...` : value;

    const pagePath = window.location.pathname;
    const entries = [];
    const addEntry = (entry) => {
        if (entry.href && !entries.some((item) => item.href === entry.href && item.title === entry.title)) {
            entries.push({
                ...entry,
                searchable: normalize(`${entry.title} ${entry.category} ${entry.searchText || entry.description}`)
            });
        }
    };

    for (const section of document.querySelectorAll(".docs-content [data-search-section]")) {
        const headings = Array.from(section.querySelectorAll("h2, h3, h4"));
        const sectionTitle = headings[0]?.textContent.trim()
            || document.querySelector(".docs-page-heading h1")?.textContent.trim()
            || "MISLend";
        const sectionText = section.textContent.replace(/\s+/g, " ").trim();
        const sectionHref = `${pagePath}#${section.id}`;

        addEntry({
            title: sectionTitle,
            category: "On this page",
            description: makePreview(plainText(section)),
            searchText: sectionText,
            href: sectionHref
        });

        for (const heading of headings.slice(1)) {
            const context = heading.closest("article, li") || section;
            addEntry({
                title: heading.textContent.trim(),
                category: sectionTitle,
                description: makePreview(plainText(context)),
                searchText: context.textContent.replace(/\s+/g, " ").trim(),
                href: `${pagePath}#${heading.id || section.id}`
            });
        }
    }

    for (const link of document.querySelectorAll(".docs-all-navigation .docs-nav-group > a")) {
        const destination = new URL(link.href, window.location.href);
        if (destination.pathname === pagePath) continue;

        const group = link.closest(".docs-nav-group");
        addEntry({
            title: link.textContent.trim(),
            category: group?.querySelector("h2")?.textContent.trim() || "MISLend",
            description: "Open this topic",
            href: link.getAttribute("href")
        });
    }

    let visibleEntries = [];
    let activeIndex = -1;

    const closeSuggestions = () => {
        searchSuggestions.hidden = true;
        searchInput.setAttribute("aria-expanded", "false");
        searchInput.removeAttribute("aria-activedescendant");
        activeIndex = -1;
    };

    const setActiveSuggestion = (index) => {
        if (visibleEntries.length === 0) return;
        activeIndex = (index + visibleEntries.length) % visibleEntries.length;

        const options = searchSuggestions.querySelectorAll('[role="option"]');
        options.forEach((option, optionIndex) => {
            const active = optionIndex === activeIndex;
            option.classList.toggle("is-active", active);
            option.setAttribute("aria-selected", String(active));
        });

        const activeOption = options[activeIndex];
        searchInput.setAttribute("aria-activedescendant", activeOption.id);
        activeOption.scrollIntoView({ block: "nearest" });
    };

    const renderSuggestions = () => {
        const query = normalize(searchInput.value);
        const terms = query.split(" ").filter(Boolean);
        const matches = entries
            .map((entry, index) => {
                if (!terms.every((term) => entry.searchable.includes(term))) return null;

                const title = normalize(entry.title);
                const score = (title === query ? 100 : 0)
                    + (title.startsWith(query) ? 30 : 0)
                    + (title.includes(query) ? 15 : 0)
                    + (normalize(entry.category).includes(query) ? 5 : 0);

                return { entry, index, score };
            })
            .filter(Boolean)
            .sort((first, second) => second.score - first.score)
            .slice(0, 7);

        visibleEntries = matches.map((match) => match.entry);
        activeIndex = -1;
        searchSuggestions.replaceChildren();

        if (visibleEntries.length === 0) {
            const empty = document.createElement("div");
            empty.className = "docs-search-empty";
            empty.setAttribute("role", "option");
            empty.setAttribute("aria-disabled", "true");
            empty.textContent = "No matching topics found.";
            searchSuggestions.append(empty);
            searchStatus.textContent = "No matching topics found.";
        } else {
            visibleEntries.forEach((entry, index) => {
                const option = document.createElement("a");
                option.className = "docs-search-suggestion";
                option.id = `docsSearchOption${index}`;
                option.href = entry.href;
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", "false");

                const title = document.createElement("span");
                title.className = "docs-search-suggestion-title";
                title.textContent = entry.title;

                const detail = document.createElement("span");
                detail.className = "docs-search-suggestion-detail";
                detail.textContent = `${entry.category} · ${entry.description}`;

                option.append(title, detail);
                searchSuggestions.append(option);
            });
            searchStatus.textContent = `${visibleEntries.length} suggestion${visibleEntries.length === 1 ? "" : "s"}.`;
        }

        searchSuggestions.hidden = false;
        searchInput.setAttribute("aria-expanded", "true");
    };

    searchInput.addEventListener("input", renderSuggestions);
    searchInput.addEventListener("focus", renderSuggestions);

    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
            renderSuggestions();
        }
    });

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" && !searchSuggestions.hidden) {
            event.preventDefault();
            setActiveSuggestion(activeIndex + 1);
        } else if (event.key === "ArrowUp" && !searchSuggestions.hidden) {
            event.preventDefault();
            setActiveSuggestion(activeIndex < 0 ? visibleEntries.length - 1 : activeIndex - 1);
        } else if (event.key === "Enter" && !searchSuggestions.hidden && visibleEntries.length > 0) {
            event.preventDefault();
            searchSuggestions.querySelectorAll('[role="option"]')[activeIndex < 0 ? 0 : activeIndex].click();
        } else if (event.key === "Escape") {
            closeSuggestions();
        }
    });

    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (searchSuggestions.hidden) renderSuggestions();
        if (visibleEntries.length > 0) {
            searchSuggestions.querySelector('[role="option"]:not([aria-disabled="true"])')?.click();
        }
    });

    document.addEventListener("pointerdown", (event) => {
        if (!searchForm.contains(event.target)) closeSuggestions();
    });
}
