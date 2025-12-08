// Register Discord slash commands for MyCirkle bot
// Usage: BOT_TOKEN=your_token_here APPLICATION_ID=your_app_id_here node register-commands.js

const APPLICATION_ID = process.env.APPLICATION_ID || '1426682720544624720';
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error('❌ Error: BOT_TOKEN environment variable is required');
    console.log('Usage: BOT_TOKEN=your_token APPLICATION_ID=your_app_id node register-commands.js');
    process.exit(1);
}

const commands = [
    {
        name: 'balance',
        description: 'Check MyCirkle points balance',
        options: [
            {
                name: 'user',
                description: 'User to check balance for (leave empty for yourself)',
                type: 6, // USER type
                required: false
            }
        ]
    },
    {
        name: 'leaderboard',
        description: 'See the top MyCirkle members by points',
    },
    {
        name: 'givepoints',
        description: '[ADMIN] Give points to a user',
        options: [
            {
                name: 'points',
                description: 'Amount of points to give',
                type: 4, // INTEGER type
                required: true,
                min_value: 1
            },
            {
                name: 'user',
                description: 'User to give points to',
                type: 6, // USER type
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for giving points',
                type: 3, // STRING type
                required: true
            }
        ]
    },
    {
        name: 'deductpoints',
        description: '[ADMIN] Deduct points from a user',
        options: [
            {
                name: 'points',
                description: 'Amount of points to deduct',
                type: 4, // INTEGER type
                required: true,
                min_value: 1
            },
            {
                name: 'user',
                description: 'User to deduct points from',
                type: 6, // USER type
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for deducting points',
                type: 3, // STRING type
                required: true
            }
        ]
    },
    {
        name: 'process',
        description: '[ADMIN] Process a reward redemption',
        options: [
            {
                name: 'reward',
                description: 'Reward being redeemed',
                type: 3, // STRING type
                required: true,
                choices: [
                    { name: '20% off product (500pts)', value: '20_off_product' },
                    { name: '40% off commission (750pts)', value: '40_off_commission' },
                    { name: 'Free Product (200pts)', value: 'free_product' }
                ]
            },
            {
                name: 'user',
                description: 'User redeeming the reward',
                type: 6, // USER type
                required: true
            }
        ]
    },
    {
        name: 'dailyreward',
        description: '[ADMIN] Set the daily reward',
        options: [
            {
                name: 'reward',
                description: 'Name of the daily reward',
                type: 3, // STRING type
                required: true
            },
            {
                name: 'points',
                description: 'Points value for the daily reward',
                type: 4, // INTEGER type
                required: true,
                min_value: 1
            }
        ]
    },
    {
        name: 'adminconfig',
        description: '[ADMIN] Manage user access and moderation',
        options: [
            {
                name: 'action',
                description: 'Action to perform',
                type: 3, // STRING type
                required: true,
                choices: [
                    { name: 'Suspend/Unsuspend User', value: 'suspend' }
                ]
            }
        ]
    },
    {
        name: 'productembed',
        description: '[ADMIN] Send product purchase information embed',
    },
    {
        name: 'removeproduct',
        description: '[ADMIN] Remove a product from a user\'s dashboard',
        options: [
            {
                name: 'user',
                description: 'The user to remove the product from',
                type: 6, // USER type
                required: true
            },
            {
                name: 'product',
                description: 'Product ID or name to remove',
                type: 3, // STRING type
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for removal',
                type: 3, // STRING type
                required: false
            }
        ]
    }
];

async function registerCommands() {
    const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;
    
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(commands),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Failed to register commands:', error);
            process.exit(1);
        }

        const data = await response.json();
        console.log('✅ Successfully registered commands:');
        data.forEach(cmd => {
            const isAdmin = ['givepoints', 'deductpoints', 'process', 'dailyreward', 'adminconfig', 'productembed'].includes(cmd.name);
            const prefix = isAdmin ? '🔒 [ADMIN] ' : '   ';
            console.log(`${prefix}/${cmd.name} - ${cmd.description}`);
        });
        console.log(`\n📊 Total: ${data.length} commands registered`);
        console.log(`\n⚠️  Admin commands require admin role in Discord server`);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

registerCommands();
