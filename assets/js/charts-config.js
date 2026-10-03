/**
 * Dashboard Analytics Configuration
 * Handles ApexCharts initialization and real-time Firebase data syncing
 */

(function (window) {
    'use strict';

    let borrowingTrendsChart = null;
    let categoryDistChart = null;

    // Theme Colors
    const COLORS = {
        navy: '#0b1f3a',
        gold: '#c8921a',
        blue: '#1e5fa8',
        blueLight: '#3b82f6',
        success: '#1e5fa8',
        warning: '#f59e0b',
        danger: '#ef4444'
    };

    /**
     * Initialize charts on the dashboard
     */
    function initCharts() {
        // --- Borrowing Trends (Area Chart) ---
        const trendsOptions = {
            series: [{
                name: 'Total Borrowings',
                data: [0, 0, 0, 0, 0, 0, 0]
            }],
            chart: {
                height: 350,
                type: 'area',
                toolbar: { show: false },
                zoom: { enabled: false },
                fontFamily: 'DM Sans, sans-serif'
            },
            dataLabels: { enabled: false },
            stroke: {
                curve: 'smooth',
                width: 3,
                colors: [COLORS.gold]
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.45,
                    opacityTo: 0.05,
                    stops: [20, 100],
                    colorStops: [
                        { offset: 0, color: COLORS.gold, opacity: 0.4 },
                        { offset: 100, color: COLORS.gold, opacity: 0 }
                    ]
                }
            },
            xaxis: {
                categories: [],
                axisBorder: { show: false },
                axisTicks: { show: false },
                labels: { style: { colors: '#94a3b8', fontSize: '12px' } }
            },
            yaxis: {
                labels: { style: { colors: '#94a3b8', fontSize: '12px' } }
            },
            grid: {
                borderColor: '#f1f5f9',
                strokeDashArray: 4
            },
            tooltip: {
                x: { format: 'dd MMM' },
                theme: 'light'
            },
            markers: {
                size: 4,
                colors: [COLORS.gold],
                strokeColors: '#fff',
                strokeWidth: 2,
                hover: { size: 6 }
            }
        };

        const trendsEl = document.querySelector('#borrowingTrendsChart');
        if (trendsEl) {
            borrowingTrendsChart = new ApexCharts(trendsEl, trendsOptions);
            borrowingTrendsChart.render();
        }

        // --- Equipment Distribution (Donut Chart) ---
        const distOptions = {
            series: [0, 0, 0, 0, 0],
            chart: {
                type: 'donut',
                height: 350,
                fontFamily: 'DM Sans, sans-serif'
            },
            labels: ['Projectors', 'Cables', 'Remotes', 'Displays', 'Others'],
            colors: [COLORS.navy, COLORS.blue, COLORS.gold, COLORS.blueLight, '#e2e8f0'],
            dataLabels: { enabled: false },
            legend: {
                position: 'bottom',
                fontFamily: 'DM Sans, sans-serif',
                labels: { colors: '#475569' }
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '75%',
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: 'Total',
                                fontSize: '14px',
                                color: '#94a3b8',
                                formatter: function (w) {
                                    return w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                }
                            }
                        }
                    }
                }
            },
            stroke: { width: 0 }
        };

        const distEl = document.querySelector('#categoryDistChart');
        if (distEl) {
            categoryDistChart = new ApexCharts(distEl, distOptions);
            categoryDistChart.render();
        }
    }

    /**
     * Sycn dashboard charts with real-time Firestore data
     * @param {string|null} userId - If provided, filter by specific user (Student Dashboard)
     */
    async function syncDashboardCharts(userId = null) {
        try {
            const db = firebase.firestore();

            // 1. Borrowing Trends Data (Last 7 Days)
            const days = [];
            const categories = [];
            const dayCounts = {};

            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                categories.push(dateStr);
                dayCounts[date.toDateString()] = 0;
            }

            let logsQuery = db.collection('borrowings');
            if (userId) {
                logsQuery = logsQuery.where('userId', '==', userId);
            }

            const logsSnapshot = await logsQuery.get();
            logsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.borrowedAt) {
                    const date = data.borrowedAt.toDate();
                    const dateKey = date.toDateString();
                    if (dayCounts.hasOwnProperty(dateKey)) {
                        dayCounts[dateKey]++;
                    }
                }
            });

            const trendsData = Object.values(dayCounts);

            if (borrowingTrendsChart) {
                borrowingTrendsChart.updateOptions({
                    xaxis: { categories: categories }
                });
                borrowingTrendsChart.updateSeries([{
                    name: userId ? 'My Borrowings' : 'Total Borrowings',
                    data: trendsData
                }]);
            }

            // 2. Equipment Distribution (Only for Admin)
            if (categoryDistChart && !userId) {
                const equipSnap = await db.collection('equipment').get();
                const counts = {
                    projector: 0,
                    cable: 0,
                    remote: 0,
                    display: 0,
                    other: 0
                };

                equipSnap.forEach(doc => {
                    const cat = (doc.data().category || 'other').toLowerCase();
                    if (counts.hasOwnProperty(cat)) counts[cat]++;
                    else counts.other++;
                });

                categoryDistChart.updateSeries([
                    counts.projector,
                    counts.cable,
                    counts.remote,
                    counts.display,
                    counts.other
                ]);
            }

        } catch (error) {
            console.error('Error syncing charts:', error);
        }
    }

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        initCharts();
    });

    // Expose to window
    window.syncDashboardCharts = syncDashboardCharts;

})(window);
