/* Microinterações: brilho que segue o cursor nos cards e profundidade na hero */
(function () {
    'use strict';
    const { $, $$, reducedMotion } = window.NRJ;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // Spotlight: guarda a posição do cursor em variáveis CSS
    if (finePointer) {
        $$('.spotlight').forEach((card) => {
            card.addEventListener('pointermove', (event) => {
                const rect = card.getBoundingClientRect();
                card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
                card.style.setProperty('--my', `${event.clientY - rect.top}px`);
            });
        });
    }

    // Parallax leve nas camadas da interface ilustrativa
    const root = $('[data-parallax-root]');
    if (root && finePointer && !reducedMotion.matches) {
        const layers = $$('[data-parallax]', root);
        const hero = root.closest('section');
        let frame = null;

        hero.addEventListener('pointermove', (event) => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                const rect = hero.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width - 0.5;
                const y = (event.clientY - rect.top) / rect.height - 0.5;
                layers.forEach((layer) => {
                    const depth = Number(layer.dataset.parallax);
                    layer.style.translate = `${(x * depth).toFixed(1)}px ${(y * depth).toFixed(1)}px`;
                });
            });
        });

        hero.addEventListener('pointerleave', () => {
            layers.forEach((layer) => { layer.style.translate = '0 0'; });
        });
    }

    // Ano atual no rodapé
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
