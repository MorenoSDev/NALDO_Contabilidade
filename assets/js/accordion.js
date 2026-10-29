/* FAQ: abre e fecha as respostas com animação de altura (uma aberta por vez) */
(function () {
    'use strict';
    const { $, $$, reducedMotion } = window.NRJ;

    $$('[data-accordion]').forEach((accordion) => {
        const items = $$('.acc-item', accordion);

        function setOpen(item, open) {
            const trigger = $('.acc-trigger', item);
            const panel = $('.acc-panel', item);
            if (trigger.getAttribute('aria-expanded') === String(open)) return;

            trigger.setAttribute('aria-expanded', String(open));
            item.classList.toggle('is-open', open);

            if (reducedMotion.matches) {
                panel.hidden = !open;
                return;
            }

            panel.getAnimations().forEach((a) => a.cancel());
            if (open) {
                panel.hidden = false;
                const height = panel.scrollHeight;
                panel.animate(
                    [{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }],
                    { duration: 320, easing: 'cubic-bezier(.16, 1, .3, 1)' },
                );
            } else {
                const height = panel.scrollHeight;
                const anim = panel.animate(
                    [{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
                    { duration: 240, easing: 'cubic-bezier(.65, 0, .35, 1)' },
                );
                anim.onfinish = () => { panel.hidden = true; };
            }
        }

        items.forEach((item, index) => {
            const trigger = $('.acc-trigger', item);
            const panel = $('.acc-panel', item);
            const id = `faq-${index + 1}`;
            panel.id = id;
            panel.setAttribute('role', 'region');
            trigger.id = `${id}-btn`;
            trigger.setAttribute('aria-controls', id);
            panel.setAttribute('aria-labelledby', trigger.id);

            trigger.addEventListener('click', () => {
                const willOpen = trigger.getAttribute('aria-expanded') !== 'true';
                items.forEach((other) => { if (other !== item) setOpen(other, false); });
                setOpen(item, willOpen);
            });
        });
    });
})();
