// Configuration
const WORKER_URL = 'https://mycirkle-auth.marcusray.workers.dev'; // Replace with your Worker URL
const REDIRECT_URI = window.location.origin + window.location.pathname;
const MOCK_PRODUCTS = [
    { id: 1, img: 'https://via.placeholder.com/200x150?text=Product+1', name: 'Sample Product', price: '$19.99', desc: 'A great product.', payment: 'Credit Card', date: '2025-01-15' },
    { id: 2, img: 'https://via.placeholder.com/200x150?text=Product+2', name: 'Another Item', price: '$29.99', desc: 'Even better.', payment: 'PayPal', date: '2025-02-10' }
];
let currentUser = JSON.parse(localStorage.getItem('mycirkleUser')) || null;
let currentPoints = parseInt(localStorage.getItem('points')) || 0;
let dailyRewards = ['10% off', 'Free Shipping', 'Bonus Points'];
let currentDailyIndex = 0;
let targetPoints = 100;
let generatedCodes = {};

// DOM Elements
const pages = document.querySelectorAll('.page');
const modals = document.querySelectorAll('.modal-overlay');
const loginBtn = document.getElementById('login-btn');
const profileIcon = document.getElementById('profile-icon');
const profileName = document.getElementById('profile-name');
const dashProfileImg = document.getElementById('dash-profile-img');
const dashProfileName = document.getElementById('dash-profile-name');
const memberSince = document.getElementById('member-since');
const availablePoints = document.getElementById('available-points');
const progressFill = document.getElementById('progress-fill');
const targetSelect = document.getElementById('target-select');
const dailyRewardText = document.getElementById('daily-reward-text');
const productsList = document.getElementById('products-list');
const welcomeName = document.getElementById('welcome-name');
const redeemName = document.getElementById('redeem-name');
const rewardCode = document.getElementById('reward-code');
const scratchCanvas = document.getElementById('scratch-canvas');
const codeReveal = document.getElementById('code-reveal');
const cardName = document.getElementById('card-name');
const backName = document.getElementById('back-name');
const backEmail = document.getElementById('back-email');
const backPoints = document.getElementById('back-points');
const accountIdSpan = document.getElementById('account-id');
const loyaltyCard = document.getElementById('loyalty-card');

// Init
document.addEventListener('DOMContentLoaded', () => {
    updatePoints();
    rotateDailyReward();
    setInterval(rotateDailyReward, 5000);
    targetSelect.addEventListener('change', (e) => {
        targetPoints = parseInt(e.target.value);
        updateProgress();
    });
    handleHashRouting();
    window.addEventListener('hashchange', handleHashRouting);

    // Event Listeners
    loginBtn.addEventListener('click', handleLogin);
    document.getElementById('continue-name').addEventListener('click', handleNameSubmit);
    document.getElementById('submit-pass').addEventListener('click', handlePassSubmit);
    document.getElementById('lets-go').addEventListener('click', () => showPage('dashboard'));
    document.querySelectorAll('.menu-btn, .redeem-btn').forEach(btn => btn.addEventListener('click', handleMenuClick));
    document.getElementById('exit-redeem').addEventListener('click', () => showPage('rewards'));
    document.getElementById('save-account').addEventListener('click', saveAccount);
    document.getElementById('reset-account').addEventListener('click', showResetModal);
    document.getElementById('confirm-reset').addEventListener('click', handleReset);
    document.getElementById('cancel-reset').addEventListener('click', hideResetModal);
    document.getElementById('close-detail').addEventListener('click', hideProductModal);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Scratch Canvas
    let isDrawing = false;
    const ctx = scratchCanvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 300, 150);
    ctx.font = '16px monospace';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText('Scratch here to reveal code', 150, 75);

    scratchCanvas.addEventListener('mousedown', () => isDrawing = true);
    scratchCanvas.addEventListener('mouseup', () => isDrawing = false);
    scratchCanvas.addEventListener('mousemove', handleScratch);
    scratchCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); isDrawing = true; });
    scratchCanvas.addEventListener('touchend', () => isDrawing = false);
    scratchCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = scratchCanvas.getBoundingClientRect();
        handleScratch({ clientX: touch.clientX - rect.left, clientY: touch.clientY - rect.top });
    });

    function handleScratch(e) {
        if (!isDrawing) return;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(e.clientX, e.clientY, 20, 0, Math.PI * 2);
        ctx.fill();
        checkScratchComplete();
    }

    function checkScratchComplete() {
        const imageData = ctx.getImageData(0, 0, 300, 150);
        let transparentPixels = 0;
        for (let i = 3; i < imageData.data.length; i += 4) {
            if (imageData.data[i] === 0) transparentPixels++;
        }
        if (transparentPixels / (300 * 150) > 0.5) {
            codeReveal.classList.remove('hidden');
        }
    }

    if (currentUser) {
        showDashboard();
    }

    // Handle OAuth callback from Worker (via URL hash)
    if (window.location.hash.includes('discord-callback')) {
        handleHashCallback();
    }
});

// Handle Discord callback from URL hash
function handleHashCallback() {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split('?')[1]);
    const userDataEncoded = params.get('user');
    
    if (userDataEncoded) {
        try {
            const user = JSON.parse(decodeURIComponent(userDataEncoded));
            handleDiscordUser(user);
        } catch (err) {
            console.error('Error parsing user data:', err);
            alert('Failed to process login data.');
            window.location.hash = 'home';
        }
    }
}

// Process Discord user after OAuth
async function handleDiscordUser(user) {
    if (user.id) {
        localStorage.setItem('discordUser', JSON.stringify(user));
        
        // Check guild membership
        try {
            const membershipResponse = await fetch(`${WORKER_URL}/auth/check-membership?user_id=${user.id}`);
            const membership = await membershipResponse.json();
            if (!membership.isMember) {
                alert('You must be a member of the MyCirkle Discord server to proceed.');
                window.location.hash = 'home';
                return;
            }
        } catch (err) {
            console.error('Membership check error:', err);
        }
        
        // Show loading profile
        showPage('loading-profile');
        setTimeout(async () => {
            // Hide loading spinner, show profile
            document.querySelector('#loading-profile .loading-content').classList.add('hidden');
            document.querySelector('#loading-profile .profile-found-modern').classList.remove('hidden');
            
            profileIcon.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
            profileName.textContent = user.global_name || user.username;
            
            // Check if user exists in database
            try {
                const userDataResponse = await fetch(`${WORKER_URL}/api/user-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ discordId: user.id })
                });
                const userData = await userDataResponse.json();
                
                if (userData.found) {
                    // User exists, load their data and go to dashboard
                    currentUser = {
                        ...user,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        fullName: `${userData.firstName} ${userData.lastName}`,
                        email: userData.email,
                        memberSince: userData.memberSince,
                        signupDate: userData.signupDate
                    };
                    currentPoints = userData.points || 0;
                    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
                    localStorage.setItem('points', currentPoints);
                    
                    setTimeout(() => {
                        showPage('welcome-popup');
                        welcomeName.textContent = currentUser.fullName;
                    }, 2000);
                } else {
                    // New user, show signup form
                    setTimeout(() => showPage('create-name'), 2000);
                }
            } catch (err) {
                console.error('Error checking user data:', err);
                // If error, assume new user
                setTimeout(() => showPage('create-name'), 2000);
            }
        }, 3000);
    } else {
        alert('Authentication failed. Please try again.');
        window.location.hash = 'home';
    }
}

// Routing
function handleHashRouting() {
    const hash = window.location.hash.slice(1) || 'home';
    showPage(hash);
    if (hash === 'dashboard' || hash === 'rewards' || hash === 'faq' || hash === 'products' || hash === 'account' || hash === 'loyalty') {
        document.querySelector('.header').style.display = 'block';
    } else {
        document.querySelector('.header').style.display = 'none';
    }
}

function showPage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    modals.forEach(m => m.classList.add('hidden'));
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        window.location.hash = pageId;
    }
    if (pageId.includes('loading') || pageId === 'confirm' || pageId === 'reset-loading') {
        handleLoadingAnimations(pageId);
    }
}

// Discord Login via Worker
function handleLogin() {
    window.location.href = `${WORKER_URL}/auth/discord?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}

// Name Submit
function handleNameSubmit() {
    const first = document.getElementById('first-name').value;
    const last = document.getElementById('last-name').value;
    if (first && last) {
        const discordUser = JSON.parse(localStorage.getItem('discordUser'));
        currentUser = { ...discordUser, firstName: first, lastName: last, fullName: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, memberSince: new Date().toDateString() };
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        showPage('create-pass');
    } else {
        alert('Please enter both names.');
    }
}

// Password Submit
async function handlePassSubmit() {
    const pass = document.getElementById('user-password').value;
    if (pass.length >= 6) {
        currentUser.password = pass; // In production, hash and store securely
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        showPage('confirm');
        
        // Save to Google Sheets
        try {
            const signupResponse = await fetch(`${WORKER_URL}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    discordId: currentUser.id,
                    discordUsername: currentUser.username,
                    firstName: currentUser.firstName,
                    lastName: currentUser.lastName,
                    email: currentUser.email,
                    memberSince: currentUser.memberSince
                })
            });
            
            const result = await signupResponse.json();
            if (result.success) {
                console.log('User registered successfully');
            } else {
                console.error('Signup failed:', result.error);
            }
        } catch (err) {
            console.error('Error during signup:', err);
        }
        
        setTimeout(() => {
            document.getElementById('confirm-details').classList.add('hidden');
            document.getElementById('setup-portal').classList.remove('hidden');
        }, 3000);
        setTimeout(() => {
            document.getElementById('setup-portal').classList.add('hidden');
            document.getElementById('patience').classList.remove('hidden');
            setTimeout(() => {
                showPage('welcome-popup');
                welcomeName.textContent = currentUser.fullName;
            }, 4000);
        }, 5000);
    } else {
        alert('Password must be at least 6 characters.');
    }
}

// Show Dashboard
function showDashboard() {
    dashProfileImg.src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=128`;
    dashProfileName.textContent = currentUser.fullName;
    memberSince.textContent = `Member since: ${currentUser.memberSince}`;
    welcomeName.textContent = currentUser.fullName;
    redeemName.textContent = currentUser.fullName;
    cardName.textContent = currentUser.fullName;
    backName.textContent = currentUser.fullName;
    backEmail.textContent = currentUser.email;
    backPoints.textContent = currentPoints;
    const accountId = Math.random().toString(36).substring(2, 26).toUpperCase() + Math.random().toString(36).substring(2, 26).toUpperCase().slice(0, -2);
    accountIdSpan.textContent = accountId;
    currentUser.accountId = accountId;
    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
    renderProducts();
    showPage('dashboard');
}

// Menu Clicks
function handleMenuClick(e) {
    const page = e.target.dataset.page || e.target.closest('.menu-btn, .redeem-btn')?.dataset.page;
    if (page === 'redeem') {
        const rewardType = e.target.closest('.reward-item').querySelector('span').textContent.includes('DAILY') ? 'daily' :
                          e.target.closest('.reward-item').querySelector('span').textContent.includes('10%') ? '10off' :
                          e.target.closest('.reward-item').querySelector('span').textContent.includes('Free') ? 'free' : '40off';
        if (currentPoints >= (rewardType === 'daily' ? 0 : rewardType === '10off' ? 500 : rewardType === 'free' ? 2000 : 750)) {
            currentPoints -= rewardType === 'daily' ? 0 : rewardType === '10off' ? 500 : rewardType === 'free' ? 2000 : 750;
            localStorage.setItem('points', currentPoints);
            updatePoints();
            const code = Math.random().toString(36).substring(2, 26).toUpperCase() + Math.random().toString(36).substring(2, 26).toUpperCase().slice(0, -2);
            generatedCodes[rewardType] = code;
            rewardCode.textContent = code;
            const ctx = scratchCanvas.getContext('2d');
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, 300, 150);
            ctx.font = '16px monospace';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText('Scratch here to reveal code', 150, 75);
            codeReveal.classList.add('hidden');
            showPage('redeem');
        } else {
            alert('Not enough points!');
        }
    } else if (page === 'loyalty') {
        loyaltyCard.addEventListener('click', () => loyaltyCard.classList.toggle('flipped'), { once: true });
    } else {
        showPage(page);
    }
}

// Update Points and Progress
function updatePoints() {
    availablePoints.textContent = currentPoints;
    backPoints.textContent = currentPoints;
    updateProgress();
}

function updateProgress() {
    const percentage = Math.min((currentPoints / targetPoints) * 100, 100);
    progressFill.style.width = percentage + '%';
}

// Rotate Daily Reward
function rotateDailyReward() {
    dailyRewardText.textContent = dailyRewards[currentDailyIndex];
    currentDailyIndex = (currentDailyIndex + 1) % dailyRewards.length;
}

// Render Products
function renderProducts() {
    productsList.innerHTML = MOCK_PRODUCTS.map(product => `
        <div class="product-card" data-id="${product.id}">
            <img src="${product.img}" alt="${product.name}">
            <h4>${product.name}</h4>
            <p>${product.price}</p>
        </div>
    `).join('');
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const product = MOCK_PRODUCTS.find(p => p.id == id);
            if (product) {
                document.getElementById('detail-img').src = product.img;
                document.getElementById('detail-name').textContent = product.name;
                document.getElementById('detail-price').textContent = product.price;
                document.getElementById('detail-desc').textContent = product.desc;
                document.getElementById('detail-payment').textContent = `Payment: ${product.payment}`;
                document.getElementById('detail-date').textContent = `Date: ${product.date}`;
                showProductModal();
            }
        });
    });
}

function showProductModal() {
    document.getElementById('product-modal').classList.remove('hidden');
}

function hideProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
}

// Account Save
function saveAccount() {
    currentUser.fullName = document.getElementById('edit-name').value || currentUser.fullName;
    currentUser.password = document.getElementById('edit-pass').value || currentUser.password;
    currentUser.email = document.getElementById('edit-email').value || currentUser.email;
    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
    alert('Changes saved!');
    document.getElementById('edit-name').value = currentUser.fullName;
    document.getElementById('edit-email').value = currentUser.email;
    setTimeout(() => {
        document.getElementById('edit-name').value = currentUser.fullName;
        document.getElementById('edit-email').value = currentUser.email;
    }, 0);
}

// Reset Modal
function showResetModal() {
    document.getElementById('reset-modal').classList.remove('hidden');
}

function hideResetModal() {
    document.getElementById('reset-modal').classList.add('hidden');
}

function handleReset() {
    hideResetModal();
    showPage('reset-loading');
    setTimeout(() => {
        localStorage.clear();
        currentUser = null;
        currentPoints = 0;
        showPage('home');
    }, 20000);
}

// Logout
function handleLogout() {
    showPage('logout-loading');
    setTimeout(() => {
        localStorage.clear();
        currentUser = null;
        showPage('home');
    }, 3000);
}

// Loading Animations
function handleLoadingAnimations(pageId) {
    if (pageId === 'loading-profile') {
        // Handled in OAuth callback
    } else if (pageId === 'logout-loading') {
        // Handled in logout
    }
}

// Polyfill for older browsers
if (!window.location.origin) {
    window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
}