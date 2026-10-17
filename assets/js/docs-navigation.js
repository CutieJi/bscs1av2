const docsSidebar = document.querySelector(".docs-sidebar");

if (docsSidebar) {
    const normalizePath = (path) => path.toLowerCase().replace(/\/+$/, "") || "/";
    const sidebarItems = Array.from(docsSidebar.querySelectorAll('a[href]'))
        .map((link) => {
            const url = new URL(link.href, window.location.href);
            const target = url.hash
                ? document.getElementById(decodeURIComponent(url.hash.slice(1)))
                : null;

            return {
                link,
                path: normalizePath(url.pathname),
                target
            };
        })
        .filter((item) => item.target && item.path === normalizePath(window.location.pathname))
        .sort((left, right) => {
            if (left.target === right.target) return 0;
            return left.target.compareDocumentPosition(right.target) & Node.DOCUMENT_POSITION_FOLLOWING
                ? -1
                : 1;
        });

    const updateActiveSidebarItem = () => {
        if (sidebarItems.length === 0) return;

        const atPageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        let activeItem = atPageBottom ? sidebarItems[sidebarItems.length - 1] : sidebarItems[0];

        if (!atPageBottom) {
            for (const item of sidebarItems) {
                if (item.target.getBoundingClientRect().top > 120) break;
                activeItem = item;
            }
        }

        for (const item of sidebarItems) {
            const isActive = item === activeItem;
            item.link.classList.toggle("is-active", isActive);

            if (isActive) {
                item.link.setAttribute("aria-current", "location");
            } else {
                item.link.removeAttribute("aria-current");
            }
        }
    };

    let sidebarUpdatePending = false;
    const scheduleSidebarUpdate = () => {
        if (sidebarUpdatePending) return;
        sidebarUpdatePending = true;

        window.requestAnimationFrame(() => {
            sidebarUpdatePending = false;
            updateActiveSidebarItem();
        });
    };

    window.addEventListener("scroll", scheduleSidebarUpdate, { passive: true });
    window.addEventListener("resize", scheduleSidebarUpdate);
    window.addEventListener("hashchange", scheduleSidebarUpdate);
    updateActiveSidebarItem();
}

const docsToc = document.querySelector(".docs-toc");

if (docsToc) {
    const tocItems = Array.from(docsToc.querySelectorAll('a[href^="#"]'))
        .map((link) => ({
            link,
            target: document.getElementById(decodeURIComponent(link.hash.slice(1)))
        }))
        .filter((item) => item.target);

    const setActiveTocItem = (activeItem) => {
        for (const item of tocItems) {
            const isActive = item === activeItem;
            item.link.classList.toggle("is-active", isActive);

            if (isActive) {
                item.link.setAttribute("aria-current", "location");
            } else {
                item.link.removeAttribute("aria-current");
            }
        }
    };

    let pendingNavigation = null;
    let navigationTimer;
    let updatePending = false;

    const updateActiveTocItem = () => {
        if (tocItems.length === 0) return;

        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
            setActiveTocItem(tocItems[tocItems.length - 1]);
            return;
        }

        const threshold = 120;
        let activeItem = tocItems[0];

        for (const item of tocItems) {
            if (item.target.getBoundingClientRect().top > threshold) break;
            activeItem = item;
        }

        setActiveTocItem(activeItem);
    };

    const finishNavigation = () => {
        navigationTimer = undefined;
        if (!pendingNavigation) return;

        const targetRect = pendingNavigation.target.getBoundingClientRect();
        if (targetRect.top < window.innerHeight && targetRect.bottom > 0) {
            setActiveTocItem(pendingNavigation);
        } else {
            updateActiveTocItem();
        }

        pendingNavigation = null;
    };

    const scheduleTocUpdate = () => {
        if (pendingNavigation) {
            window.clearTimeout(navigationTimer);
            navigationTimer = window.setTimeout(finishNavigation, 120);
            return;
        }

        if (updatePending) return;
        updatePending = true;

        window.requestAnimationFrame(() => {
            updatePending = false;
            updateActiveTocItem();
        });
    };

    docsToc.addEventListener("click", (event) => {
        const link = event.target instanceof Element
            ? event.target.closest('a[href^="#"]')
            : null;
        const activeItem = tocItems.find((item) => item.link === link);
        if (activeItem) {
            pendingNavigation = activeItem;
            setActiveTocItem(activeItem);
            window.clearTimeout(navigationTimer);
            navigationTimer = window.setTimeout(finishNavigation, 120);
        }
    });

    window.addEventListener("scroll", scheduleTocUpdate, { passive: true });
    window.addEventListener("resize", scheduleTocUpdate);
    window.addEventListener("hashchange", scheduleTocUpdate);
    updateActiveTocItem();
}
