document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = refreshBtn.querySelector('.refresh-icon');
    const fscList = document.getElementById('fsc-list');
    const pipcList = document.getElementById('pipc-list');
    const naverList = document.getElementById('naver-list');
    const template = document.getElementById('article-template');

    // Function to render skeleton loaders
    function renderSkeletons(container) {
        container.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-item';
            container.appendChild(skeleton);
        }
    }

    // Function to render articles
    function renderArticles(articles, container) {
        container.innerHTML = '';

        if (!articles || articles.length === 0) {
            container.innerHTML = '<div class="article-card" style="text-align: center; color: var(--text-secondary);">게시물을 불러오지 못했습니다.</div>';
            return;
        }

        articles.forEach((article, index) => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.article-card');

            // Stagger animation delay
            card.style.animation = `fadeInUp 0.5s ease forwards ${index * 0.1}s`;
            card.style.opacity = '0';

            card.href = article.url;
            card.querySelector('.article-dept').textContent = article.department || '공통';
            card.querySelector('.article-date').textContent = article.date;
            card.querySelector('.article-title').textContent = article.title;

            container.appendChild(clone);
        });
    }

    // Add animation styles dynamically
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);

    // Fetch and update Data
    async function updateDashboard() {
        // Set loading state
        refreshIcon.classList.add('spinning');
        refreshBtn.disabled = true;
        renderSkeletons(fscList);
        renderSkeletons(pipcList);
        renderSkeletons(naverList);

        try {
            // Call our local API endpoint
            const response = await fetch('/api/articles');
            if (!response.ok) throw new Error('API Request Failed');

            const data = await response.json();

            renderArticles(data.fsc, fscList);
            renderArticles(data.pipc, pipcList);
            renderArticles(data.naver, naverList);

        } catch (error) {
            console.error('Failed to fetch articles:', error);
            fscList.innerHTML = '<div class="article-card" style="text-align:center;color:#ef4444;">데이터를 불러오는 중 오류가 발생했습니다.</div>';
            pipcList.innerHTML = '<div class="article-card" style="text-align:center;color:#ef4444;">데이터를 불러오는 중 오류가 발생했습니다.</div>';
            naverList.innerHTML = '<div class="article-card" style="text-align:center;color:#ef4444;">데이터를 불러오는 중 오류가 발생했습니다.</div>';
        } finally {
            refreshIcon.classList.remove('spinning');
            refreshBtn.disabled = false;
        }
    }

    // Bind event listener
    refreshBtn.addEventListener('click', updateDashboard);

    // Initial load
    updateDashboard();
});
