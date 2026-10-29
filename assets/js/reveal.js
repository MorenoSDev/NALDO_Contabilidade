/* Animações ligadas à rolagem: entrada dos blocos, contadores e linha do "Como funciona" */
(function () {
    'use strict';
    const { $, $$, reducedMotion } = window.NRJ;

    // Entrada suave com atraso escalonado entre irmãos
    const items = $$('[data-reveal]');
    items.forEach((el) => {
        const siblings = Array.from(el.parentElement.children).filter((c) => c.hasAttribute('data-reveal'));
        const index = siblings.indexOf(el);
        if (index > 0) el.style.setProperty('--reveal-delay', `${Math.min(index * 0.08, 0.4)}s`);
    });

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
        items.forEach((el) => el.classList.add('is-visible'));
    } else {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                revealObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
        items.forEach((el) => revealObserver.observe(el));
    }

    // Contadores numéricos
    const counters = $$('[data-count]');
    const animateCount = (el) => {
        const target = Number(el.dataset.count);
        const prefix = el.dataset.prefix || '';
        const start = performance.now();
        const step = (now) => {
            const p = Math.min((now - start) / 1600, 1);
            el.textContent = prefix + Math.round(target * (1 - (1 - p) ** 3));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    if (!reducedMotion.matches) {
        const countObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                countObserver.unobserve(entry.target);
                animateCount(entry.target);
            });
        }, { threshold: 0.6 });
        counters.forEach((el) => countObserver.observe(el));
    }

    // Linha de progresso das etapas acompanha a rolagem
    const steps = $('[data-steps]');
    if (steps) {
        const stepItems = $$('.step', steps);
        let ticking = false;
        const update = () => {
            ticking = false;
            const rect = steps.getBoundingClientRect();
            const vh = window.innerHeight;
            const progress = Math.min(Math.max((vh * 0.75 - rect.top) / (rect.height + vh * 0.3), 0), 1);
            steps.style.setProperty('--progress', progress.toFixed(3));
            stepItems.forEach((item, i) => {
                item.classList.toggle('is-active', progress >= i / stepItems.length + 0.05);
            });
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }
})();
