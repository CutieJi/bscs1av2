const docsThemeToggle = document.querySelector(".docs-theme-toggle");

if (docsThemeToggle) {
    const docsThemeLabel = docsThemeToggle.querySelector(".docs-theme-label");

    const updateDocsThemeToggle = () => {
        const isDark = document.documentElement.dataset.docsTheme === "dark";
        docsThemeToggle.setAttribute("aria-pressed", String(isDark));
        docsThemeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
        docsThemeLabel.textContent = isDark ? "Light mode" : "Dark mode";
    };

    updateDocsThemeToggle();

    docsThemeToggle.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.docsTheme === "dark" ? "light" : "dark";
        document.documentElement.dataset.docsTheme = nextTheme;
        localStorage.setItem("misLendDocsTheme", nextTheme);
        updateDocsThemeToggle();
    });
}
