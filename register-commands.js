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
        description: 'Check your MyCirkle points balance',
    },
    {
        name: 'card',
        description: 'View your MyCirkle loyalty card',
    },
    {
        name: 'rewards',
        description: 'Browse available rewards in the MyCirkle store',
    },
    {
        name: 'redeem',
        description: 'Redeem a reward with your points',
        options: [
            {
                name: 'reward',
                description: 'The reward you want to redeem',
                type: 3, // STRING type
                required: true,
                autocomplete: true
            }
        ]
    },
    {
        name: 'history',
        description: 'View your points history and transactions',
    },
    {
        name: 'profile',
        description: 'View your MyCirkle account profile',
    },
    {
        name: 'leaderboard',
        description: 'See the top MyCirkle members by points',
    },
    {
        name: 'help',
        description: 'Get help with MyCirkle commands',
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
            console.log(`   /${cmd.name} - ${cmd.description}`);
        });
        console.log(`\n📊 Total: ${data.length} commands registered`);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

registerCommands();
