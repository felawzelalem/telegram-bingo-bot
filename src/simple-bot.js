require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || '8137204479:AAEPWwMeItuWkVM5-hgVLB6dE4eLyT9voIo';
const MINI_APP_URL = process.env.MINI_APP_URL || 'http://thisbingo.kesug.com/miniapp';

if (!BOT_TOKEN) {
    console.error('BOT_TOKEN is required');
    process.exit(1);
}

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Welcome message
const welcomeMessage = `
🎮 *Welcome to King Bingo!*

Play exciting Bingo games and win real money!

💰 *Features:*
• Multiple stake amounts
• Real-time gameplay
• Instant withdrawals
• Referral bonuses

Click the button below to start playing! 👇
`;

// Start command
bot.start((ctx) => {
    ctx.replyWithPhoto(
        { url: 'https://via.placeholder.com/800x400/00D9A3/ffffff?text=King+Bingo' },
        {
            caption: welcomeMessage,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 Play Now', MINI_APP_URL)]
            ])
        }
    ).catch(() => {
        // If image fails, send text only
        ctx.reply(
            welcomeMessage,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp('🎮 Play Now', MINI_APP_URL)]
                ])
            }
        );
    });
});

// Help command
bot.command('help', (ctx) => {
    ctx.reply(
        `❓ *How to Play King Bingo*\n\n` +
        `1️⃣ Click "Play Now" button\n` +
        `2️⃣ Register with your phone number\n` +
        `3️⃣ Deposit money to your wallet\n` +
        `4️⃣ Choose a stake and select your cartela\n` +
        `5️⃣ Wait for the game to start\n` +
        `6️⃣ Numbers will be called automatically\n` +
        `7️⃣ First to complete the pattern wins!\n\n` +
        `💰 *Minimum Deposit:* 10 Birr\n` +
        `💸 *Minimum Withdrawal:* 50 Birr\n\n` +
        `📞 *Support:* Contact @admin for help`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 Play Now', MINI_APP_URL)]
            ])
        }
    );
});

// Play command
bot.command('play', (ctx) => {
    ctx.reply(
        '🎮 *Ready to Play?*\n\nClick the button below to open the game!',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 Open Game', MINI_APP_URL)]
            ])
        }
    );
});

// Handle any other messages
bot.on('message', (ctx) => {
    ctx.reply(
        '👋 Hi! Use the button below to start playing King Bingo!',
        Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 Play Now', MINI_APP_URL)]
        ])
    );
});

// Error handling
bot.catch((err, ctx) => {
    console.error('Bot Error:', err);
    ctx.reply('❌ An error occurred. Please try /start again.');
});

// Launch bot
bot.launch()
    .then(() => {
        console.log('✅ King Bingo Bot started successfully!');
        console.log('Bot username:', bot.botInfo.username);
        console.log('Mini App URL:', MINI_APP_URL);
    })
    .catch((err) => {
        console.error('❌ Failed to start bot:', err);
        process.exit(1);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
