# JV Perfumes • Gestão

Sistema leve para controle de clientes, parcelas, cobranças e estoque da JV Perfumes.

## Abrir

1. Extraia a pasta completa do ZIP.
2. Abra `index.html` com Chrome, Edge ou outro navegador moderno.
3. A navegação e os cadastros funcionam mesmo abrindo o arquivo diretamente, sem servidor local.

> Para instalação como PWA e notificações mais completas, publique a pasta em um endereço HTTPS (GitHub Pages, Netlify, Vercel etc.).

## Estrutura

O código-fonte continua separado por responsabilidade:

- `js/utils.js` — datas, moeda e utilitários
- `js/storage.js` — armazenamento e backup
- `js/dashboard.js` — painel principal
- `js/clients.js` — clientes e parcelas
- `js/inventory.js` — estoque
- `js/notifications.js` — alertas e notificações
- `js/app.js` — navegação e inicialização
- `js/app.bundle.js` — versão compilada usada pelo `index.html` para também funcionar por duplo clique

## Backup e Restaurar

Nesta versão os dados ficam no `localStorage` do navegador. O botão **Backup** baixa um arquivo JSON com clientes, parcelas, estoque e configurações. O botão **Restaurar** lê esse arquivo e repõe os dados.

Isso é útil antes de limpar o navegador, formatar o PC ou trocar de computador. Quando o projeto ganhar banco de dados/login, esse backup manual pode virar apenas uma opção de segurança.

## Notificações

A tela de alertas identifica parcelas vencidas e próximas do vencimento. Notificações reais em segundo plano no celular dependem de HTTPS e suporte do navegador/PWA. Para alertas confiáveis mesmo com o app fechado, a evolução recomendada é usar backend + push (por exemplo, Supabase/Firebase + Web Push).


## Juros por atraso
O sistema vem configurado com 20% ao mês de juros simples proporcionais aos dias de atraso e 2% de multa única. Os percentuais podem ser alterados na tela Alertas. Valores pagos em atraso ficam congelados no valor atualizado do dia em que a parcela é marcada como paga.
