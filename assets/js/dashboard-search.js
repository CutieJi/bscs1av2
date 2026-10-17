(function (window) {
    'use strict';

    let equipmentRequest;
    let equipmentRequestTime = 0;
    const borrowingRequests = new Map();

    function loadEquipment() {
        if (!equipmentRequest || Date.now() - equipmentRequestTime > 30000) {
            equipmentRequestTime = Date.now();
            equipmentRequest = window.db.collection('equipment').get()
                .then(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
                .catch(error => {
                    equipmentRequest = null;
                    equipmentRequestTime = 0;
                    throw error;
                });
        }
        return equipmentRequest;
    }

    function loadBorrowings(userId) {
        const key = userId || 'all';
        const cached = borrowingRequests.get(key);
        if (!cached || Date.now() - cached.createdAt > 30000) {
            let query = window.db.collection('borrowings').orderBy('borrowedAt', 'desc').limit(100);
            if (userId) query = window.db.collection('borrowings')
                .where('userId', '==', userId)
                .limit(100);

            borrowingRequests.set(key, {
                createdAt: Date.now(),
                request: query.get()
                    .then(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
                    .catch(error => {
                        borrowingRequests.delete(key);
                        throw error;
                    })
            });
        }
        return borrowingRequests.get(key).request;
    }

    function normalize(value) {
        return String(value || '')
            .toLocaleLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getPageResults(query) {
        const normalizedQuery = normalize(query);
        const pages = [];
        const seen = new Set();

        document.querySelectorAll('.nav-item[data-view]').forEach(navItem => {
            const viewId = navItem.dataset.view;
            const view = document.getElementById(`${viewId}View`);
            if (!view || seen.has(viewId)) return;
            if (window.getComputedStyle(navItem).display === 'none') return;
            seen.add(viewId);

            const label = navItem.textContent.trim().replace(/\s+/g, ' ');
            const content = view.textContent.replace(/\s+/g, ' ').trim();
            const searchableText = normalize(`${label} ${content}`);
            if (normalizedQuery && !searchableText.includes(normalizedQuery)) return;

            const labelMatch = normalize(label).includes(normalizedQuery);
            const matchIndex = normalizedQuery ? searchableText.indexOf(normalizedQuery) : 0;
            const contentMatchIndex = matchIndex - label.length - 1;
            const excerpt = labelMatch
                ? label
                : content.slice(Math.max(0, contentMatchIndex - 40), contentMatchIndex + 80).trim();

            pages.push({
                kind: 'page',
                viewId,
                title: label,
                detail: excerpt || 'Open this dashboard page',
                rank: labelMatch ? 0 : 1
            });
        });

        return pages.sort((a, b) => a.rank - b.rank).slice(0, 4);
    }

    function getEquipmentResults(equipment, query, options) {
        const normalizedQuery = normalize(query);

        return equipment
            .filter(item => !options.filterEquipment || options.filterEquipment(item))
            .filter(item => !normalizedQuery || [
                item.equipmentId,
                item.name,
                item.category,
                item.description
            ].some(value => normalize(value).includes(normalizedQuery)))
            .slice(0, 4)
            .map(item => ({
                kind: 'equipment',
                item,
                title: item.name || item.equipmentId || 'Equipment',
                detail: [item.equipmentId, item.category, item.status].filter(Boolean).join(' · '),
                rank: normalizedQuery && normalize(item.name).startsWith(normalizedQuery) ? 0 : 1
            }));
    }

    function getSuggestions(items, query) {
        const terms = normalize(query).split(' ').filter(Boolean);
        const seen = new Set();
        return items
            .filter(item => {
                const searchable = normalize(`${item.value} ${item.title} ${item.detail}`);
                return terms.every(term => searchable.includes(term));
            })
            .filter(item => {
                const key = normalize(item.value);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 6);
    }

    function initializeDashboardFieldSearch(inputId, getItems) {
        const input = document.getElementById(inputId);
        const anchor = input?.closest('.search-group') || input?.parentElement;
        if (!input || !anchor || input.dataset.dashboardSuggestionsInitialized) return;
        input.dataset.dashboardSuggestionsInitialized = 'true';

        const suggestions = document.createElement('div');
        suggestions.className = 'topbar-search-suggestions';
        suggestions.id = `${inputId}Suggestions`;
        suggestions.setAttribute('role', 'listbox');
        suggestions.hidden = true;
        anchor.appendChild(suggestions);
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', suggestions.id);
        input.setAttribute('aria-expanded', 'false');

        let visibleItems = [];
        let activeIndex = -1;
        let requestNumber = 0;
        let suppressSuggestionRefresh = false;

        function closeSuggestions() {
            requestNumber += 1;
            suggestions.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            anchor.classList.remove('has-suggestions');
            visibleItems = [];
            activeIndex = -1;
        }

        function setActive(index) {
            if (!visibleItems.length) return;
            activeIndex = (index + visibleItems.length) % visibleItems.length;
            const options = suggestions.querySelectorAll('[role="option"]');
            options.forEach((option, optionIndex) => {
                const active = optionIndex === activeIndex;
                option.classList.toggle('is-active', active);
                option.setAttribute('aria-selected', String(active));
            });
            input.setAttribute('aria-activedescendant', options[activeIndex].id);
            options[activeIndex].scrollIntoView({ block: 'nearest' });
        }

        function choose(item) {
            input.value = item.value;
            closeSuggestions();
            suppressSuggestionRefresh = true;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            suppressSuggestionRefresh = false;
        }

        async function render() {
            const currentRequest = ++requestNumber;
            try {
                const items = await getItems();
                if (currentRequest !== requestNumber) return;
                visibleItems = getSuggestions(items, input.value);
                activeIndex = -1;
                suggestions.replaceChildren();

                if (!visibleItems.length) {
                    const empty = document.createElement('div');
                    empty.className = 'topbar-search-suggestion topbar-search-suggestion-empty';
                    empty.setAttribute('role', 'option');
                    empty.setAttribute('aria-disabled', 'true');
                    empty.textContent = input.value.trim()
                        ? 'No matching suggestions.'
                        : 'No suggestions available.';
                    suggestions.appendChild(empty);
                } else {
                    visibleItems.forEach((item, index) => {
                        const option = document.createElement('button');
                        option.type = 'button';
                        option.className = 'topbar-search-suggestion';
                        option.id = `${inputId}Suggestion${index}`;
                        option.setAttribute('role', 'option');
                        option.setAttribute('aria-selected', 'false');

                        const title = document.createElement('span');
                        title.className = 'topbar-search-suggestion-title';
                        title.textContent = item.title;

                        const detail = document.createElement('span');
                        detail.className = 'topbar-search-suggestion-details';
                        detail.textContent = item.detail || '';
                        option.append(title, detail);
                        option.addEventListener('click', () => choose(item));
                        suggestions.appendChild(option);
                    });
                }

                suggestions.hidden = false;
                input.setAttribute('aria-expanded', 'true');
                anchor.classList.add('has-suggestions');
            } catch (error) {
                console.error(`Error loading search suggestions for ${inputId}:`, error);
                closeSuggestions();
                window.showToast?.('Unable to load suggestions. Please try again.', 'error');
            }
        }

        input.addEventListener('input', () => {
            if (!suppressSuggestionRefresh) render();
        });
        input.addEventListener('focus', render);
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' && !suggestions.hidden) {
                event.preventDefault();
                setActive(activeIndex + 1);
            } else if (event.key === 'ArrowUp' && !suggestions.hidden) {
                event.preventDefault();
                setActive(activeIndex < 0 ? visibleItems.length - 1 : activeIndex - 1);
            } else if (event.key === 'Enter' && !suggestions.hidden && visibleItems.length) {
                event.preventDefault();
                choose(visibleItems[activeIndex < 0 ? 0 : activeIndex]);
            } else if (event.key === 'Escape') {
                closeSuggestions();
            }
        });
        document.addEventListener('pointerdown', event => {
            if (!anchor.contains(event.target)) closeSuggestions();
        });
    }

    function initializeDashboardSearch(options) {
        const form = document.getElementById('topbarSearchForm');
        const input = document.getElementById('topbarSearchInput');
        if (!form || !input) return;

        const suggestions = document.createElement('div');
        suggestions.className = 'topbar-search-suggestions';
        suggestions.id = 'topbarSearchSuggestions';
        suggestions.setAttribute('role', 'listbox');
        suggestions.hidden = true;
        form.appendChild(suggestions);

        input.placeholder = 'Search pages and equipment...';
        input.setAttribute('aria-label', 'Search dashboard pages and equipment');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', suggestions.id);
        input.setAttribute('aria-expanded', 'false');

        let results = [];
        let activeIndex = -1;
        let requestNumber = 0;

        function closeSuggestions() {
            requestNumber += 1;
            suggestions.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            form.classList.remove('has-suggestions');
            results = [];
            activeIndex = -1;
        }

        function chooseResult(result) {
            closeSuggestions();
            options.onSelect(result, input.value.trim());
        }

        function setActiveResult(index) {
            const buttons = suggestions.querySelectorAll('.topbar-search-suggestion');
            if (!buttons.length) return;

            activeIndex = (index + buttons.length) % buttons.length;
            buttons.forEach((button, buttonIndex) => {
                const isActive = buttonIndex === activeIndex;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-selected', String(isActive));
            });
            input.setAttribute('aria-activedescendant', buttons[activeIndex].id);
        }

        async function updateSuggestions() {
            const query = input.value.trim();
            const currentRequest = ++requestNumber;
            results = [];
            activeIndex = -1;

            try {
                const pages = getPageResults(query);
                const equipment = await loadEquipment();
                if (currentRequest !== requestNumber || input.value.trim() !== query) return [];

                const equipmentResults = getEquipmentResults(equipment, query, options);
                const popularEquipment = equipmentResults;
                results = [
                    ...pages.filter(page => page.rank === 0),
                    ...popularEquipment,
                    ...pages.filter(page => page.rank !== 0)
                ].slice(0, 8);
                suggestions.replaceChildren();

                if (!results.length) {
                    const empty = document.createElement('div');
                    empty.className = 'topbar-search-suggestion topbar-search-suggestion-empty';
                    empty.setAttribute('role', 'option');
                    empty.setAttribute('aria-disabled', 'true');
                    empty.textContent = 'No matching pages or equipment.';
                    suggestions.appendChild(empty);
                    suggestions.hidden = false;
                    input.setAttribute('aria-expanded', 'true');
                    form.classList.add('has-suggestions');
                    return [];
                }

                results.forEach((result, index) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'topbar-search-suggestion';
                    button.id = `topbarSearchSuggestion${index}`;
                    button.setAttribute('role', 'option');
                    button.setAttribute('aria-selected', 'false');

                    const title = document.createElement('span');
                    title.className = 'topbar-search-suggestion-title';
                    title.textContent = result.title;

                    const details = document.createElement('span');
                    details.className = 'topbar-search-suggestion-details';
                    details.textContent = result.kind === 'page'
                        ? `Page · ${result.detail}`
                        : `Equipment · ${result.detail}`;

                    button.append(title, details);
                    button.addEventListener('click', () => chooseResult(result));
                    suggestions.appendChild(button);
                });

                suggestions.hidden = false;
                input.setAttribute('aria-expanded', 'true');
                form.classList.add('has-suggestions');
                return results;
            } catch (error) {
                console.error('Error loading dashboard search suggestions:', error);
                closeSuggestions();
                window.showToast?.('Unable to load search suggestions. Please try again.', 'error');
                return [];
            }
        }

        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' && !suggestions.hidden) {
                event.preventDefault();
                setActiveResult(activeIndex + 1);
            } else if (event.key === 'ArrowUp' && !suggestions.hidden) {
                event.preventDefault();
                setActiveResult(activeIndex < 0 ? results.length - 1 : activeIndex - 1);
            } else if (event.key === 'Enter' && activeIndex >= 0 && !suggestions.hidden) {
                event.preventDefault();
                chooseResult(results[activeIndex]);
            } else if (event.key === 'Escape') {
                closeSuggestions();
            }
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const query = input.value.trim();
            const currentResults = results.length ? results : await updateSuggestions();
            if (input.value.trim() !== query) return;
            if (currentResults.length) {
                chooseResult(currentResults[activeIndex >= 0 ? activeIndex : 0]);
            } else {
                window.showToast?.('No pages or equipment matched your search.', 'info');
            }
        });

        document.addEventListener('pointerdown', event => {
            if (!form.contains(event.target)) closeSuggestions();
        });
    }

    window.getDashboardEquipmentItems = loadEquipment;
    window.getDashboardBorrowingItems = loadBorrowings;
    window.initializeDashboardSearch = initializeDashboardSearch;
    window.initializeDashboardFieldSearch = initializeDashboardFieldSearch;
})(window);
