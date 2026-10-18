// Sombra no cabeçalho ao rolar
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
    header.classList.toggle('sticky', window.scrollY > 0);
});

// Menu mobile
const nav = document.getElementById('nav');
const btnMobile = document.getElementById('btn-mobile');

function setMenu(aberto) {
    nav.classList.toggle('active', aberto);
    btnMobile.setAttribute('aria-expanded', aberto);
    btnMobile.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
}

btnMobile.addEventListener('click', () => setMenu(!nav.classList.contains('active')));

// Fecha o menu ao clicar em um link
document.querySelectorAll('#menu a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
});

// Destaca no menu a seção visível
const linksMenu = document.querySelectorAll('#menu a[href^="#"]:not(.btn)');
const secoes = [...linksMenu]
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

const observadorMenu = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        linksMenu.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === '#' + entrada.target.id);
        });
    });
}, { rootMargin: '-45% 0px -50% 0px' });

secoes.forEach((secao) => observadorMenu.observe(secao));

// Elementos aparecem suavemente ao rolar
const animados = document.querySelectorAll('.card, .step, .value, .about-img, .about-text, details, .form');
const observadorReveal = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
            entrada.target.classList.add('visible');
            observadorReveal.unobserve(entrada.target);
        }
    });
}, { threshold: 0.15 });

animados.forEach((el) => {
    el.classList.add('reveal');
    observadorReveal.observe(el);
});

// Ano atual no rodapé
document.getElementById('ano').textContent = new Date().getFullYear();
