// Chatbot guiado: perguntas prontas que terminam no WhatsApp.
// Para mudar textos ou adicionar caminhos, edite apenas o objeto "fluxo".

const VOLTAR = ['Ver outras opções', 'inicio'];
const CONTATO = ['Falar com um contador', 'contato'];

const fluxo = {
    inicio: {
        mensagens: [
            'Olá! 👋 Sou o assistente virtual da NRJ Contabilidade.',
            'Sobre o que você gostaria de saber?',
        ],
        opcoes: [
            ['Abrir uma empresa', 'abrir'],
            ['Trocar de contador', 'trocar'],
            ['Sou MEI', 'mei'],
            ['Folha de pagamento', 'folha'],
            ['Pagar menos impostos', 'planejamento'],
            ['Quanto custa?', 'preco'],
            CONTATO,
        ],
    },

    abrir: {
        assunto: 'Abrir uma empresa',
        mensagens: [
            'Ótimo! Cuidamos de todo o processo de abertura: escolha do tipo de empresa, enquadramento tributário, registro, CNPJ, inscrições e alvarás.',
            'Antes de abrir, fazemos uma análise para indicar o regime tributário mais econômico para a sua atividade.',
        ],
        opcoes: [CONTATO, ['Quanto custa?', 'preco'], VOLTAR],
    },

    trocar: {
        assunto: 'Trocar de contador',
        mensagens: [
            'Trocar de contador é mais simples do que parece. 😉',
            'Nós mesmos falamos com o contador anterior e cuidamos de toda a transição. Você só precisa assinar a autorização.',
        ],
        opcoes: [CONTATO, ['Quanto custa?', 'preco'], VOLTAR],
    },

    mei: {
        assunto: 'MEI',
        mensagens: ['Atendemos MEI sim! Qual é a sua situação?'],
        opcoes: [
            ['Quero manter o MEI em dia', 'mei-em-dia'],
            ['Meu faturamento passou do limite', 'mei-me'],
            VOLTAR,
        ],
    },

    'mei-em-dia': {
        assunto: 'MEI em dia',
        mensagens: [
            'Ajudamos com o DAS mensal, a declaração anual (DASN-SIMEI) e a emissão de notas fiscais, para você não ter dor de cabeça com multas.',
        ],
        opcoes: [CONTATO, VOLTAR],
    },

    'mei-me': {
        assunto: 'Desenquadramento de MEI para ME',
        mensagens: [
            'Nesse caso é preciso fazer o desenquadramento do MEI para ME. Quanto antes, melhor, para evitar cobranças retroativas.',
            'Cuidamos de todo o processo e indicamos o melhor regime tributário para o novo porte da empresa.',
        ],
        opcoes: [CONTATO, VOLTAR],
    },

    folha: {
        assunto: 'Folha de pagamento',
        mensagens: [
            'Cuidamos da folha de funcionários CLT e do pró-labore dos sócios, além de admissões, férias, 13º, rescisões e eSocial.',
            'O valor varia conforme o número de colaboradores.',
        ],
        opcoes: [CONTATO, ['Quanto custa?', 'preco'], VOLTAR],
    },

    planejamento: {
        assunto: 'Planejamento tributário',
        mensagens: [
            'Muitas empresas pagam mais imposto do que precisariam por estarem no regime errado.',
            'Com o planejamento tributário, analisamos sua atividade e faturamento para reduzir a carga de impostos dentro da lei.',
        ],
        opcoes: [CONTATO, VOLTAR],
    },

    preco: {
        assunto: 'Valores / proposta',
        mensagens: [
            'O valor da mensalidade depende do regime tributário, do faturamento e do número de funcionários.',
            'Fale com um contador e receba uma proposta sem compromisso. 🙂',
        ],
        opcoes: [CONTATO, VOLTAR],
    },
};

const chat = document.getElementById('chat');
const chatJanela = document.getElementById('chat-janela');
const chatBotao = document.getElementById('chat-botao');
const chatMensagens = document.getElementById('chat-mensagens');
const chatOpcoes = document.getElementById('chat-opcoes');
const chatEntrada = document.getElementById('chat-entrada');
const chatTexto = document.getElementById('chat-texto');

const conversa = {
    iniciada: false,
    assunto: 'Atendimento pelo chat',
    nome: '',
    telefone: '',
    aguardando: null, // 'nome' | 'telefone' | null
};

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rolarParaFim() {
    chatMensagens.scrollTop = chatMensagens.scrollHeight;
}

function adicionarMensagem(texto, autor) {
    const balao = document.createElement('div');
    balao.className = `msg msg-${autor}`;
    balao.textContent = texto;
    chatMensagens.appendChild(balao);
    rolarParaFim();
}

async function botDiz(mensagens) {
    for (const texto of mensagens) {
        const digitando = document.createElement('div');
        digitando.className = 'msg msg-bot msg-digitando';
        digitando.innerHTML = '<i></i><i></i><i></i>';
        chatMensagens.appendChild(digitando);
        rolarParaFim();
        await espera(Math.min(400 + texto.length * 12, 1300));
        digitando.remove();
        adicionarMensagem(texto, 'bot');
    }
}

function mostrarOpcoes(opcoes) {
    chatOpcoes.innerHTML = '';
    opcoes.forEach(([rotulo, destino]) => {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = rotulo;
        botao.addEventListener('click', () => {
            adicionarMensagem(rotulo, 'user');
            irPara(destino);
        });
        chatOpcoes.appendChild(botao);
    });
    rolarParaFim();
}

function pedirTexto(campo, placeholder, tipo = 'text') {
    conversa.aguardando = campo;
    chatOpcoes.innerHTML = '';
    chatEntrada.hidden = false;
    chatTexto.type = tipo;
    chatTexto.placeholder = placeholder;
    chatTexto.value = '';
    chatTexto.focus();
}

async function irPara(destino) {
    chatOpcoes.innerHTML = '';
    chatEntrada.hidden = true;

    if (destino === 'contato') {
        await botDiz([
            'Perfeito! Vou te conectar com um dos nossos contadores pelo WhatsApp.',
            'Seus dados serão usados só para retornarmos o contato (veja a Política de Privacidade no rodapé). Qual é o seu nome?',
        ]);
        pedirTexto('nome', 'Digite seu nome');
        return;
    }

    const etapa = fluxo[destino] || fluxo.inicio;
    if (etapa.assunto) conversa.assunto = etapa.assunto;

    // Ao voltar para o início, não repete a saudação
    const mensagens = destino === 'inicio' && conversa.iniciada
        ? ['Claro! Sobre o que mais você gostaria de saber?']
        : etapa.mensagens;
    conversa.iniciada = true;

    await botDiz(mensagens);
    mostrarOpcoes(etapa.opcoes);
}

async function finalizar() {
    chatEntrada.hidden = true;
    await botDiz([
        `Obrigado, ${conversa.nome.split(' ')[0]}! Clique abaixo para continuar a conversa no WhatsApp. Nossa equipe já vai saber o assunto. ✅`,
    ]);

    chatOpcoes.innerHTML = '';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'opcao-whats';
    botao.textContent = 'Continuar no WhatsApp';
    botao.addEventListener('click', () => {
        // iniciarWhatsApp vem do app.js: envia o aviso por e-mail e abre o WhatsApp
        iniciarWhatsApp({
            nome: conversa.nome,
            telefone: conversa.telefone,
            servico: conversa.assunto,
            origem: 'chatbot do site',
        });
    });
    chatOpcoes.appendChild(botao);
    mostrarVoltar();
}

function mostrarVoltar() {
    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.textContent = 'Voltar ao início';
    voltar.addEventListener('click', () => irPara('inicio'));
    chatOpcoes.appendChild(voltar);
    rolarParaFim();
}

chatEntrada.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const valor = chatTexto.value.trim();
    if (!valor) return;

    adicionarMensagem(valor, 'user');
    chatTexto.value = '';

    if (conversa.aguardando === 'nome') {
        conversa.nome = valor;
        chatEntrada.hidden = true;
        await botDiz([`Prazer, ${valor.split(' ')[0]}! Qual é o seu telefone com DDD?`]);
        pedirTexto('telefone', '(11) 90000-0000', 'tel');
        return;
    }

    if (conversa.aguardando === 'telefone') {
        const digitos = valor.replace(/\D/g, '');
        if (digitos.length < 10 || digitos.length > 13) {
            chatEntrada.hidden = true;
            await botDiz(['Hmm, esse número parece incompleto. Pode digitar com o DDD? Ex.: (11) 91234-5678']);
            pedirTexto('telefone', '(11) 90000-0000', 'tel');
            return;
        }
        conversa.telefone = valor;
        conversa.aguardando = null;
        finalizar();
    }
});

function abrirChat(aberto) {
    chatJanela.hidden = !aberto;
    chat.classList.toggle('aberto', aberto);
    chat.classList.add('visto');
    chatBotao.setAttribute('aria-expanded', aberto);
    chatBotao.setAttribute('aria-label', aberto ? 'Fechar assistente virtual' : 'Abrir assistente virtual');
    if (aberto && !conversa.iniciada) irPara('inicio');
}

chatBotao.addEventListener('click', () => abrirChat(chatJanela.hidden));
document.getElementById('chat-fechar').addEventListener('click', () => abrirChat(false));

document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !chatJanela.hidden) abrirChat(false);
});
