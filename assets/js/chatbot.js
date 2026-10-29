/* Chatbot guiado: perguntas prontas que terminam no WhatsApp.
   Para mudar textos ou adicionar caminhos, edite apenas o objeto "fluxo". */
(function () {
    'use strict';
    const { $, isValidPhone, formatPhone, startWhatsApp } = window.NRJ;

    const VOLTAR = ['Ver outras opções', 'inicio'];
    const CONTATO = ['Falar com um contador', 'contato'];
    const PRECO = ['Quanto custa?', 'preco'];

    const fluxo = {
        inicio: {
            mensagens: [
                'Olá! 👋 Sou o assistente virtual da NRJ Contabilidade.',
                'Sobre o que você gostaria de saber?',
            ],
            opcoes: [
                ['Contabilidade da empresa', 'contabil'],
                ['Abrir uma empresa', 'abrir'],
                ['Trocar de contador', 'trocar'],
                ['Alterar ou encerrar empresa', 'alterar'],
                ['Sou MEI', 'mei'],
                ['Portal do cliente', 'portal'],
                PRECO,
                CONTATO,
            ],
        },

        contabil: {
            assunto: 'Contabilidade da empresa',
            mensagens: [
                'Cuidamos da escrituração contábil e das demonstrações da sua empresa: balancetes mensais, balanço patrimonial, DRE e relatórios contábeis.',
                'Tudo fica disponível no portal do cliente para você visualizar ou baixar quando precisar.',
            ],
            opcoes: [CONTATO, PRECO, VOLTAR],
        },

        abrir: {
            assunto: 'Abrir uma empresa',
            mensagens: [
                'Ótimo! Definimos com você o tipo de empresa e cuidamos de todo o processo: registro, CNPJ, inscrições e alvarás.',
            ],
            opcoes: [CONTATO, PRECO, VOLTAR],
        },

        trocar: {
            assunto: 'Trocar de contador',
            mensagens: [
                'Trocar de contador é mais simples do que parece. 😉',
                'Nós falamos com o contador anterior e cuidamos de toda a transição. Você só precisa assinar a autorização.',
            ],
            opcoes: [CONTATO, PRECO, VOLTAR],
        },

        alterar: {
            assunto: 'Alteração ou encerramento de empresa',
            mensagens: [
                'Fazemos alterações contratuais, como mudança de endereço, de sócios ou de atividade, e também a baixa (encerramento) da empresa.',
            ],
            opcoes: [CONTATO, VOLTAR],
        },

        mei: {
            assunto: 'MEI',
            mensagens: ['Atendemos MEI sim! Qual é a sua situação?'],
            opcoes: [
                ['Quero manter o MEI regular', 'mei-regular'],
                ['Meu faturamento passou do limite', 'mei-me'],
                VOLTAR,
            ],
        },

        'mei-regular': {
            assunto: 'MEI',
            mensagens: [
                'Orientamos você sobre as obrigações do MEI para manter a empresa regular e acompanhamos o crescimento do negócio.',
            ],
            opcoes: [CONTATO, VOLTAR],
        },

        'mei-me': {
            assunto: 'Desenquadramento de MEI para ME',
            mensagens: [
                'Nesse caso é preciso fazer o desenquadramento do MEI para ME. Quanto antes, melhor.',
                'Cuidamos de todo o processo de registro e documentação da nova empresa.',
            ],
            opcoes: [CONTATO, VOLTAR],
        },

        portal: {
            assunto: 'Portal do cliente',
            mensagens: [
                'Clientes da NRJ recebem acesso ao portal, onde ficam balanços, DRE, balancetes e documentos societários da empresa.',
                'Se você já é cliente, entre pela Área do cliente no topo do site. Esqueceu a senha? Use "Esqueci minha senha" na tela de login.',
            ],
            opcoes: [CONTATO, VOLTAR],
        },

        preco: {
            assunto: 'Valores / proposta',
            mensagens: [
                'O valor da mensalidade depende do porte da empresa e do volume de movimentação.',
                'Fale com um contador e receba uma proposta sem compromisso. 🙂',
            ],
            opcoes: [CONTATO, VOLTAR],
        },
    };

    const chat = $('[data-chat]');
    if (!chat) return;
    const windowEl = $('#chat-window');
    const toggle = $('[data-chat-toggle]');
    const messages = $('[data-chat-messages]');
    const options = $('[data-chat-options]');
    const form = $('[data-chat-form]');
    const textInput = $('[data-chat-text]');

    const conversa = {
        iniciada: false,
        assunto: 'Atendimento pelo chat',
        nome: '',
        telefone: '',
        aguardando: null, // 'nome' | 'telefone' | null
    };

    const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rolarParaFim = () => { messages.scrollTop = messages.scrollHeight; };

    function adicionarMensagem(texto, autor) {
        const balao = document.createElement('div');
        balao.className = `msg msg-${autor}`;
        balao.textContent = texto;
        messages.appendChild(balao);
        rolarParaFim();
    }

    async function botDiz(lista) {
        for (const texto of lista) {
            const digitando = document.createElement('div');
            digitando.className = 'msg msg-bot msg-typing';
            digitando.setAttribute('aria-label', 'Digitando');
            digitando.innerHTML = '<i></i><i></i><i></i>';
            messages.appendChild(digitando);
            rolarParaFim();
            await espera(Math.min(350 + texto.length * 10, 1100));
            digitando.remove();
            adicionarMensagem(texto, 'bot');
        }
    }

    function botao(rotulo, aoClicar, classe) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = rotulo;
        if (classe) b.className = classe;
        b.addEventListener('click', aoClicar);
        options.appendChild(b);
        return b;
    }

    function mostrarOpcoes(lista) {
        options.innerHTML = '';
        lista.forEach(([rotulo, destino]) => {
            botao(rotulo, () => {
                adicionarMensagem(rotulo, 'user');
                irPara(destino);
            });
        });
        rolarParaFim();
    }

    function pedirTexto(campo, placeholder, tipo = 'text') {
        conversa.aguardando = campo;
        options.innerHTML = '';
        form.hidden = false;
        textInput.type = tipo;
        textInput.inputMode = tipo === 'tel' ? 'tel' : 'text';
        textInput.placeholder = placeholder;
        textInput.value = '';
        textInput.focus();
    }

    async function irPara(destino) {
        options.innerHTML = '';
        form.hidden = true;

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
        const lista = destino === 'inicio' && conversa.iniciada
            ? ['Claro! Sobre o que mais você gostaria de saber?']
            : etapa.mensagens;
        conversa.iniciada = true;

        await botDiz(lista);
        mostrarOpcoes(etapa.opcoes);
    }

    async function finalizar() {
        form.hidden = true;
        await botDiz([
            `Obrigado, ${conversa.nome.split(' ')[0]}! Clique abaixo para continuar no WhatsApp. Nossa equipe já vai saber o assunto. ✅`,
        ]);
        options.innerHTML = '';
        botao('Continuar no WhatsApp', () => {
            startWhatsApp({
                nome: conversa.nome,
                telefone: conversa.telefone,
                servico: conversa.assunto,
                origem: 'chatbot do site',
            });
        }, 'opt-whats');
        botao('Voltar ao início', () => irPara('inicio'));
        rolarParaFim();
    }

    textInput.addEventListener('input', () => {
        if (conversa.aguardando === 'telefone') textInput.value = formatPhone(textInput.value);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const valor = textInput.value.trim();
        if (!valor) return;

        adicionarMensagem(valor, 'user');
        textInput.value = '';

        if (conversa.aguardando === 'nome') {
            conversa.nome = valor;
            form.hidden = true;
            await botDiz([`Prazer, ${valor.split(' ')[0]}! Qual é o seu telefone com DDD?`]);
            pedirTexto('telefone', '(11) 90000-0000', 'tel');
            return;
        }

        if (conversa.aguardando === 'telefone') {
            if (!isValidPhone(valor)) {
                form.hidden = true;
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
        windowEl.hidden = !aberto;
        chat.classList.toggle('is-open', aberto);
        chat.classList.add('is-seen');
        toggle.setAttribute('aria-expanded', String(aberto));
        toggle.setAttribute('aria-label', aberto ? 'Fechar assistente virtual' : 'Abrir assistente virtual');
        if (aberto && !conversa.iniciada) irPara('inicio');
    }

    // O balão "Posso ajudar?" some sozinho para não cobrir o conteúdo
    setTimeout(() => chat.classList.add('is-seen'), 12000);

    toggle.addEventListener('click', () => abrirChat(windowEl.hidden));
    $('[data-chat-close]').addEventListener('click', () => {
        abrirChat(false);
        toggle.focus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !windowEl.hidden) {
            abrirChat(false);
            toggle.focus();
        }
    });
})();
