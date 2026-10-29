/* Cabeçalho: estado ao rolar, menu mobile e link ativo da seção visível */
(function () {
    'use strict';
    const { $, $$ } = window.NRJ;

    const header = $('[data-header]');
    const nav = $('[data-nav]');
    const toggle = $('[data-menu-toggle]');
    if (!header || !nav || !toggle) return;

    // Fundo translúcido depois que a página começa a rolar
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Menu mobile
    const mobile = window.matchMedia('(max-width: 1024px)');

    function setMenu(open) {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) $('a', nav)?.focus({ preventScroll: true });
    }

    toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));

    nav.addEventListener('click', (event) => {
        if (event.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('is-open')) {
            setMenu(false);
            toggle.focus();
        }
    });

    document.addEventListener('click', (event) => {
        if (nav.classList.contains('is-open') && !header.contains(event.target)) setMenu(false);
    });

    mobile.addEventListener('change', () => setMenu(false));

    // Destaca no menu a seção que está no centro da tela
    const links = $$('[data-nav-link]');
    const sections = links.map((link) => $(link.getAttribute('href'))).filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((link) => {
                link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`);
            });
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach((section) => observer.observe(section));
})();
