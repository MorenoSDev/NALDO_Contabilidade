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

// Formulário rápido do WhatsApp: avisa por e-mail e abre a conversa
const WHATS_NUMERO = '5511985368975';
const STATICFORMS_KEY = 'b300ce7d-565b-430d-b09f-6f9b3aa66312';

const modal = document.getElementById('modal-whats');
const formWhats = document.getElementById('form-whats');

document.querySelectorAll('[data-whats]').forEach((botao) => {
    botao.addEventListener('click', (evento) => {
        // Navegadores sem <dialog> seguem direto para o WhatsApp
        if (typeof modal.showModal !== 'function') return;
        evento.preventDefault();
        modal.showModal();
        document.getElementById('w-nome').focus();
    });
});

modal.querySelector('[data-fechar]').addEventListener('click', () => modal.close());

// Fecha ao clicar fora da caixa
modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.close();
});

function enviarNotificacaoEmail(dados) {
    const corpo = new URLSearchParams({
        accessKey: STATICFORMS_KEY,
        subject: 'Novo contato pelo WhatsApp do site - ' + dados.nome,
        name: dados.nome,
        phone: dados.telefone,
        email: dados.email || 'não informado',
        message: 'Contato iniciado pelo botão do WhatsApp. Assunto: ' + dados.servico,
        '$servico': dados.servico,
        honeypot: dados.honeypot,
    });
    if (dados.email) corpo.append('replyTo', dados.email);

    // keepalive garante o envio mesmo que a página perca o foco ao abrir o WhatsApp
    return fetch('https://api.staticforms.xyz/submit', {
        method: 'POST',
        body: corpo,
        keepalive: true,
    }).catch(() => { /* falha no e-mail não impede a conversa no WhatsApp */ });
}

formWhats.addEventListener('submit', (evento) => {
    evento.preventDefault();

    const dados = {
        nome: formWhats.name.value.trim(),
        telefone: formWhats.phone.value.trim(),
        email: formWhats.email.value.trim(),
        servico: formWhats.servico.value,
        honeypot: formWhats.honeypot.value,
    };

    enviarNotificacaoEmail(dados);

    const texto = `Olá! Meu nome é ${dados.nome}. Vim pelo site e gostaria de falar sobre: ${dados.servico}.`;
    const url = `https://wa.me/${WHATS_NUMERO}?text=${encodeURIComponent(texto)}`;

    // Abre na hora do clique para não ser bloqueado como pop-up
    const janela = window.open(url, '_blank');
    if (janela) janela.opener = null;
    else window.location.href = url;

    modal.close();
    formWhats.reset();
});

// Ano atual no rodapé
document.getElementById('ano').textContent = new Date().getFullYear();
