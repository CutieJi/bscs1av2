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
