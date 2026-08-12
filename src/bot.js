require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const http = require('http');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;
const MINI_APP_URL = process.env.MINI_APP_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
    console.error('BOT_TOKEN is required');
    process.exit(1);
}

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Create a simple HTTP server for health checks (Render requirement)
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            bot: 'King Bingo Bot',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(PORT, () => {
    console.log(`✅ Health check server running on port ${PORT}`);
});

// Store user sessions
const userSessions = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================

async function apiCall(endpoint, method = 'GET', data = null, token = null) {
    try {
        const config = {
            method,
            url: `${API_URL}/${endpoint}`,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        
        if (data) {
            config.data = data;
        }
        
        console.log(`📞 API Call: ${method} ${API_URL}/${endpoint}`);
        console.log('📦 Request data:', JSON.stringify(data));
        
        const response = await axios(config);
        console.log(`✅ API Response (${endpoint}):`, response.data);
        return response.data;
    } catch (error) {
        console.error(`❌ API Error (${endpoint}):`, {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: `${API_URL}/${endpoint}`
        });
        return { success: false, message: error.response?.data?.message || error.message || 'API request failed' };
    }
}

function getMainKeyboard() {
    return Markup.keyboard([
        ['💰 Deposit', '💸 Withdraw'],
        ['🎮 Play Bingo', '💼 My Wallet'],
        ['📊 My Stats', '🎁 Referral'],
        ['❓ Help']
    ]).resize();
}

function getAdminKeyboard() {
    return Markup.keyboard([
        ['👥 Users', '💵 Deposits', '💸 Withdrawals'],
        ['🎮 Games', '⚙️ Settings', '🤖 Bot Players'],
        ['📊 Statistics', '🔙 User Menu']
    ]).resize();
}

async function registerUser(ctx) {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || '';
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    
    const result = await apiCall('auth/login', 'POST', {
        telegram_id: telegramId,
        username,
        first_name: firstName,
        last_name: lastName
    });
    
    if (result.success) {
        userSessions.set(telegramId, result.data);
        return result.data;
    }
    
    return null;
}

function formatCurrency(amount) {
    return `${parseFloat(amount).toFixed(2)} Birr`;
}

// ============================================
// BOT COMMANDS
// ============================================

// Start command
bot.start(async (ctx) => {
    const user = await registerUser(ctx);
    
    if (!user) {
        return ctx.reply('Failed to start bot. Please try again.');
    }
    
    const siteName = user.user.is_admin ? 'Admin Panel - Bingo' : 'Beteseb Bingo';
    
    let welcomeMessage = `🎮 Welcome to ${siteName}!\n\n`;
    
    if (user.user.is_admin) {
        welcomeMessage += `👑 Hello Admin ${user.user.first_name}!\n\n`;
        welcomeMessage += `You have ${user.user.admin_role === 'super_admin' ? 'SUPER ADMIN' : 'ADMIN'} access.\n\n`;
    } else {
        welcomeMessage += `Hello ${user.user.first_name}! 👋\n\n`;
    }
    
    if (!user.user.phone) {
        welcomeMessage += `📱 Please share your contact to complete registration:`;
        return ctx.reply(welcomeMessage, 
            Markup.keyboard([
                [Markup.button.contactRequest('📱 Share Contact')]
            ]).resize()
        );
    }
    
    welcomeMessage += `💰 Balance: ${formatCurrency(user.user.main_wallet)}\n`;
    welcomeMessage += `🎮 Games Played: ${user.user.games_played}\n`;
    welcomeMessage += `🏆 Games Won: ${user.user.games_won}\n\n`;
    welcomeMessage += `Choose an option below:`;
    
    ctx.reply(welcomeMessage, user.user.is_admin ? getAdminKeyboard() : getMainKeyboard());
});

// Handle contact sharing
bot.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    
    if (contact.user_id !== ctx.from.id) {
        return ctx.reply('❌ Please share your own contact.');
    }
    
    const result = await apiCall('auth/share-contact', 'POST', {
        telegram_id: ctx.from.id,
        phone: contact.phone_number
    });
    
    if (result.success) {
        const session = userSessions.get(ctx.from.id);
        if (session) {
            session.user.phone = contact.phone_number;
        }
        
        ctx.reply(
            '✅ Contact registered successfully!\n\n' +
            '💰 Balance: 0.00 Birr\n\n' +
            'Choose an option below:',
            getMainKeyboard()
        );
    } else {
        ctx.reply('❌ Failed to register contact. Please try again.');
    }
});

// Play Bingo
bot.hears(['🎮 Play Bingo', '/play'], async (ctx) => {
    const session = userSessions.get(ctx.from.id) || await registerUser(ctx);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    const webAppUrl = `${MINI_APP_URL}?user_id=${ctx.from.id}&token=${session.token}`;
    
    ctx.reply(
        '🎮 *Open Bingo Game*\n\n' +
        'Click the button below to start playing!',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🎮 Play Now', webAppUrl)]
            ])
        }
    );
});

// My Wallet
bot.hears(['💼 My Wallet', '/wallet'], async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    const result = await apiCall('wallet/balance', 'GET', null, session.token);
    
    if (result.success) {
        ctx.reply(
            `💼 *Your Wallet*\n\n` +
            `💰 Main Wallet: ${formatCurrency(result.data.main_wallet)}\n` +
            `🎮 Play Wallet: ${formatCurrency(result.data.play_wallet)}\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `💵 Total: ${formatCurrency(result.data.total)}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        ctx.reply('❌ Failed to fetch wallet balance.');
    }
});

// Deposit
bot.hears(['💰 Deposit', '/deposit'], async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    // Get payment methods
    const result = await apiCall('wallet/payment-methods', 'GET', null, session.token);
    
    if (!result.success) {
        return ctx.reply('❌ Failed to fetch payment methods.');
    }
    
    let message = '💰 *Deposit Money*\n\n';
    message += 'Available Payment Methods:\n\n';
    
    result.data.methods.forEach(method => {
        if (method.is_deposit_enabled) {
            message += `📱 *${method.name}*\n`;
            message += `Account: ${method.account_number}\n`;
            message += `Name: ${method.account_name}\n\n`;
        }
    });
    
    message += 'Please transfer money and send:\n';
    message += '`/deposit_confirm [amount] [payment_method] [reference]`\n\n';
    message += 'Example:\n';
    message += '`/deposit_confirm 100 Telebirr TXN123456`';
    
    ctx.reply(message, { parse_mode: 'Markdown' });
});

// Deposit confirmation
bot.command('deposit_confirm', async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 3) {
        return ctx.reply('❌ Invalid format. Use:\n/deposit_confirm [amount] [method] [reference]');
    }
    
    const amount = parseFloat(args[0]);
    const paymentMethod = args[1];
    const referenceNumber = args.slice(2).join(' ');
    
    if (isNaN(amount) || amount < 10) {
        return ctx.reply('❌ Amount must be at least 10 Birr.');
    }
    
    const result = await apiCall('wallet/deposit', 'POST', {
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber
    }, session.token);
    
    if (result.success) {
        ctx.reply(
            '✅ *Deposit Request Submitted*\n\n' +
            `Amount: ${formatCurrency(amount)}\n` +
            `Method: ${paymentMethod}\n` +
            `Reference: ${referenceNumber}\n\n` +
            'Your request is pending admin approval.',
            { parse_mode: 'Markdown' }
        );
    } else {
        ctx.reply(`❌ ${result.message}`);
    }
});

// Withdraw
bot.hears(['💸 Withdraw', '/withdraw'], async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    ctx.reply(
        '💸 *Withdraw Money*\n\n' +
        'To request withdrawal, send:\n' +
        '`/withdraw_request [amount] [method] [account_number]`\n\n' +
        'Example:\n' +
        '`/withdraw_request 500 Telebirr 0912345678`\n\n' +
        'Minimum: 50 Birr\n' +
        'Maximum: 50,000 Birr',
        { parse_mode: 'Markdown' }
    );
});

// Withdraw request
bot.command('withdraw_request', async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 3) {
        return ctx.reply('❌ Invalid format. Use:\n/withdraw_request [amount] [method] [account]');
    }
    
    const amount = parseFloat(args[0]);
    const paymentMethod = args[1];
    const accountNumber = args[2];
    
    if (isNaN(amount) || amount < 50) {
        return ctx.reply('❌ Minimum withdrawal is 50 Birr.');
    }
    
    const result = await apiCall('wallet/withdraw', 'POST', {
        amount,
        payment_method: paymentMethod,
        account_number: accountNumber
    }, session.token);
    
    if (result.success) {
        ctx.reply(
            '✅ *Withdrawal Request Submitted*\n\n' +
            `Amount: ${formatCurrency(amount)}\n` +
            `Method: ${paymentMethod}\n` +
            `Account: ${accountNumber}\n\n` +
            'Your request is pending admin approval.',
            { parse_mode: 'Markdown' }
        );
    } else {
        ctx.reply(`❌ ${result.message}`);
    }
});

// My Stats
bot.hears(['📊 My Stats', '/stats'], async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    const result = await apiCall('user/stats', 'GET', null, session.token);
    
    if (result.success) {
        const stats = result.data;
        ctx.reply(
            `📊 *Your Statistics*\n\n` +
            `🎮 Games Played: ${stats.games_played}\n` +
            `🏆 Games Won: ${stats.games_won}\n` +
            `📈 Win Rate: ${stats.win_rate}%\n\n` +
            `💰 Total Won: ${formatCurrency(stats.total_won)}\n` +
            `💸 Total Lost: ${formatCurrency(stats.total_lost)}\n\n` +
            `📥 Total Deposited: ${formatCurrency(stats.total_deposited)}\n` +
            `📤 Total Withdrawn: ${formatCurrency(stats.total_withdrawn)}\n\n` +
            `🎁 Referral Earnings: ${formatCurrency(stats.referral_earnings)}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        ctx.reply('❌ Failed to fetch statistics.');
    }
});

// Referral
bot.hears(['🎁 Referral', '/referral'], async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    
    if (!session) {
        return ctx.reply('Please /start the bot first.');
    }
    
    const result = await apiCall('user/referral', 'GET', null, session.token);
    
    if (result.success) {
        const ref = result.data;
        const botUsername = ctx.botInfo.username;
        const referralLink = `https://t.me/${botUsername}?start=${ref.code}`;
        
        ctx.reply(
            `🎁 *Referral Program*\n\n` +
            `Your Code: \`${ref.code}\`\n` +
            `Your Link: ${referralLink}\n\n` +
            `👥 Referred Users: ${ref.referred_count}\n` +
            `💰 Total Earnings: ${formatCurrency(ref.earnings)}\n\n` +
            `${ref.bonus_active ? `🎉 Earn ${ref.bonus_percent}% of each referral's first deposit!` : ''}`,
            { parse_mode: 'Markdown' }
        );
    } else {
        ctx.reply('❌ Failed to fetch referral information.');
    }
});

// Help
bot.hears(['❓ Help', '/help'], (ctx) => {
    ctx.reply(
        `❓ *Help & Instructions*\n\n` +
        `🎮 *How to Play:*\n` +
        `1. Deposit money to your wallet\n` +
        `2. Click "Play Bingo"\n` +
        `3. Choose your stake amount\n` +
        `4. Select your cartela (card)\n` +
        `5. Wait for game to start\n` +
        `6. Numbers will be called automatically\n` +
        `7. First to complete pattern wins!\n\n` +
        `💰 *Commands:*\n` +
        `/start - Start the bot\n` +
        `/play - Open game\n` +
        `/wallet - Check balance\n` +
        `/deposit - Deposit money\n` +
        `/withdraw - Withdraw money\n` +
        `/stats - View statistics\n` +
        `/referral - Get referral link\n` +
        `/help - Show this help\n\n` +
        `📞 *Support:* Contact admin for help`,
        { parse_mode: 'Markdown' }
    );
});

// ============================================
// GAME AUTOMATION (Cron Jobs)
// ============================================

// This would need to be implemented in the PHP backend with a cron endpoint
// For now, this is a placeholder

// ============================================
// ERROR HANDLING
// ============================================

bot.catch((err, ctx) => {
    console.error('Bot Error:', err);
    ctx.reply('❌ An error occurred. Please try again.');
});

// ============================================
// START BOT
// ============================================

bot.launch()
    .then(() => {
        console.log('✅ Bot started successfully!');
        console.log('Bot username:', bot.botInfo.username);
    })
    .catch((err) => {
        console.error('❌ Failed to start bot:', err);
        process.exit(1);
    });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
