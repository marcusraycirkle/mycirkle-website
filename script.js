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

// DOM Elements - will be populated after DOM loads
let pages, modals, profileIcon, profileName, dashProfileImg, dashProfileName;
let memberSince, availablePoints, progressFill, targetSelect, dailyRewardText;
let productsList, welcomeName, redeemName, rewardCode, scratchCanvas, codeReveal;
let cardName, backName, backEmail, backPoints, accountIdSpan, loyaltyCard;

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Get all DOM elements after page loads
    pages = document.querySelectorAll('.page');
    modals = document.querySelectorAll('.modal-overlay');
    profileIcon = document.getElementById('profile-icon');
    profileName = document.getElementById('profile-name');
    dashProfileImg = document.getElementById('dash-profile-img');
    dashProfileName = document.getElementById('dash-profile-name');
    memberSince = document.getElementById('member-since');
    availablePoints = document.getElementById('available-points');
    progressFill = document.getElementById('progress-fill');
    targetSelect = document.getElementById('target-select');
    dailyRewardText = document.getElementById('daily-reward-text');
    productsList = document.getElementById('products-list');
    welcomeName = document.getElementById('welcome-name');
    redeemName = document.getElementById('redeem-name');
    rewardCode = document.getElementById('reward-code');
    scratchCanvas = document.getElementById('scratch-canvas');
    codeReveal = document.getElementById('code-reveal');
    cardName = document.getElementById('card-name');
    backName = document.getElementById('back-name');
    backEmail = document.getElementById('back-email');
    backPoints = document.getElementById('back-points');
    accountIdSpan = document.getElementById('account-id');
    loyaltyCard = document.getElementById('loyalty-card');
    
    // Only update points if elements exist (not on homepage)
    if (availablePoints && progressFill) {
        updatePoints();
    }
    if (dailyRewardText) {
        rotateDailyReward();
        setInterval(rotateDailyReward, 5000);
    }
    
    if (targetSelect) {
        targetSelect.addEventListener('change', (e) => {
            targetPoints = parseInt(e.target.value);
            updateProgress();
        });
    }
    
    handleHashRouting();
    window.addEventListener('hashchange', handleHashRouting);

    // Event Listeners
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
        console.log('Login button event listener attached');
    } else {
        console.error('Login button not found!');
    }
    
    // Add smooth scrolling for nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    const continueNameBtn = document.getElementById('continue-name');
    const submitPassBtn = document.getElementById('submit-pass');
    const submitPrefsBtn = document.getElementById('submit-preferences');
    const goDashboardBtn = document.getElementById('go-dashboard');
    const letsGoBtn = document.getElementById('lets-go');
    const exitRedeemBtn = document.getElementById('exit-redeem');
    const saveAccountBtn = document.getElementById('save-account');
    const resetAccountBtn = document.getElementById('reset-account');
    const confirmResetBtn = document.getElementById('confirm-reset');
    const cancelResetBtn = document.getElementById('cancel-reset');
    const closeDetailBtn = document.getElementById('close-detail');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (continueNameBtn) continueNameBtn.addEventListener('click', handleNameSubmit);
    if (submitPassBtn) submitPassBtn.addEventListener('click', handlePassSubmit);
    if (submitPrefsBtn) submitPrefsBtn.addEventListener('click', handlePreferencesSubmit);
    if (goDashboardBtn) goDashboardBtn.addEventListener('click', () => showDashboard());
    if (letsGoBtn) letsGoBtn.addEventListener('click', () => showPage('dashboard'));
    if (exitRedeemBtn) exitRedeemBtn.addEventListener('click', () => showPage('rewards'));
    if (saveAccountBtn) saveAccountBtn.addEventListener('click', saveAccount);
    if (resetAccountBtn) resetAccountBtn.addEventListener('click', showResetModal);
    if (confirmResetBtn) confirmResetBtn.addEventListener('click', handleReset);
    if (cancelResetBtn) cancelResetBtn.addEventListener('click', hideResetModal);
    if (closeDetailBtn) closeDetailBtn.addEventListener('click', hideProductModal);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    document.querySelectorAll('.menu-btn, .redeem-btn').forEach(btn => btn.addEventListener('click', handleMenuClick));

    // Scratch Canvas
    if (scratchCanvas) {
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
                if (codeReveal) codeReveal.classList.remove('hidden');
            }
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
    const header = document.querySelector('.header');
    if (header) {
        if (hash === 'dashboard' || hash === 'rewards' || hash === 'faq' || hash === 'products' || hash === 'account' || hash === 'loyalty') {
            header.style.display = 'block';
        } else {
            header.style.display = 'none';
        }
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
    console.log('handleLogin called!');
    console.log('WORKER_URL:', WORKER_URL);
    console.log('REDIRECT_URI:', REDIRECT_URI);
    const redirectUrl = `${WORKER_URL}/auth/discord?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    console.log('Redirecting to:', redirectUrl);
    window.location.href = redirectUrl;
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
        showPage('create-preferences');
    } else {
        alert('Password must be at least 6 characters.');
    }
}

// Preferences Submit
async function handlePreferencesSubmit() {
    const country = document.getElementById('user-country').value;
    const timezone = document.getElementById('user-timezone').value;
    const language = document.getElementById('user-language').value;
    const acceptedTerms = document.getElementById('accept-terms').checked;
    
    if (!country || !timezone) {
        alert('Please select your country and timezone.');
        return;
    }
    
    if (!acceptedTerms) {
        alert('You must agree to the Terms & Conditions to continue.');
        return;
    }
    
    // Add preferences to user data
    currentUser.country = country;
    currentUser.timezone = timezone;
    currentUser.language = language;
    currentUser.acceptedTerms = true;
    currentUser.termsAcceptedDate = new Date().toISOString();
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
}

// Show Dashboard
function showDashboard() {
    if (!currentUser) {
        console.warn('No current user, cannot show dashboard');
        return;
    }
    
    console.log('Showing dashboard for user:', currentUser);
    
    // Update profile info
    const fullName = currentUser.fullName || `${currentUser.firstName} ${currentUser.lastName}`;
    const profileNameEl = document.getElementById('dash-profile-name');
    const memberSinceEl = document.getElementById('member-since');
    
    if (profileNameEl) profileNameEl.textContent = fullName;
    if (memberSinceEl) memberSinceEl.textContent = `Member since: ${currentUser.memberSince || new Date().toLocaleDateString()}`;
    
    // Update initials
    updateUserInitials();
    
    // Generate and save account ID if doesn't exist
    if (!currentUser.accountId) {
        currentUser.accountId = generateAccountId();
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
    }
    
    // Update all user references
    updateCardInfo();
    
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
    if (availablePoints) availablePoints.textContent = currentPoints;
    if (backPoints) backPoints.textContent = currentPoints;
    updateProgress();
}

function updateProgress() {
    if (!progressFill) return;
    const percentage = Math.min((currentPoints / targetPoints) * 100, 100);
    progressFill.style.width = percentage + '%';
}

// Rotate Daily Reward
function rotateDailyReward() {
    if (!dailyRewardText) return;
    dailyRewardText.textContent = dailyRewards[currentDailyIndex];
    currentDailyIndex = (currentDailyIndex + 1) % dailyRewards.length;
}

// Render Products
async function renderProducts() {
    productsList.innerHTML = `<div class="col-span-full text-center py-8">Loading products…</div>`;

    // If we have a logged-in user, query the worker for owned products for the configured product id
    const productId = 'prod_BwM387gLYcCa8qhERIH1JliOQ'; // product to check ownership for
    try {
        if (currentUser && currentUser.id) {
            const resp = await fetch(`${WORKER_URL}/api/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discordId: currentUser.id, productId })
            });
            const data = await resp.json();
            const products = (data && data.products) ? data.products : [];

            if (!products.length) {
                productsList.innerHTML = `<div class="col-span-full text-center py-8 text-gray-600">No owned products found for this account.</div>`;
                return;
            }

            productsList.innerHTML = products.map(product => `
                <div class="product-card" data-id="${product.id}">
                    <img src="${product.img}" alt="${product.name}" class="w-full h-40 object-cover rounded-lg mb-3">
                    <h4 class="font-semibold mb-1">${product.name}</h4>
                    <p class="text-sm text-gray-500 mb-2">${product.desc || ''}</p>
                    <p class="font-bold">${product.price}</p>
                </div>
            `).join('');

            document.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    const product = products.find(p => String(p.id) === String(id));
                    if (product) {
                        const imgEl = document.getElementById('detail-img');
                        if (imgEl) imgEl.src = product.img;
                        const nameEl = document.getElementById('detail-name'); if (nameEl) nameEl.textContent = product.name;
                        const priceEl = document.getElementById('detail-price'); if (priceEl) priceEl.textContent = product.price;
                        const descEl = document.getElementById('detail-desc'); if (descEl) descEl.textContent = product.desc || '';
                        const paymentEl = document.getElementById('detail-payment'); if (paymentEl) paymentEl.textContent = `Payment: ${product.payment || 'N/A'}`;
                        const dateEl = document.getElementById('detail-date'); if (dateEl) dateEl.textContent = `Date: ${product.date || ''}`;
                        showProductModal();
                    }
                });
            });
            return;
        }
    } catch (err) {
        console.error('Error fetching owned products:', err);
    }

    // Fallback to mock products if no user or error
    productsList.innerHTML = MOCK_PRODUCTS.map(product => `
        <div class="product-card" data-id="${product.id}">
            <img src="${product.img}" alt="${product.name}" class="w-full h-40 object-cover rounded-lg mb-3">
            <h4 class="font-semibold mb-1">${product.name}</h4>
            <p class="font-bold">${product.price}</p>
        </div>
    `).join('');
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const product = MOCK_PRODUCTS.find(p => p.id == id);
            if (product) {
                const imgEl = document.getElementById('detail-img'); if (imgEl) imgEl.src = product.img;
                const nameEl = document.getElementById('detail-name'); if (nameEl) nameEl.textContent = product.name;
                const priceEl = document.getElementById('detail-price'); if (priceEl) priceEl.textContent = product.price;
                const descEl = document.getElementById('detail-desc'); if (descEl) descEl.textContent = product.desc;
                const paymentEl = document.getElementById('detail-payment'); if (paymentEl) paymentEl.textContent = `Payment: ${product.payment}`;
                const dateEl = document.getElementById('detail-date'); if (dateEl) dateEl.textContent = `Date: ${product.date}`;
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

// Modern Navigation Functions
function showRewards() {
    showPage('rewards');
    updatePoints();
}

function showFAQ() {
    showPage('faq');
}

function showProducts() {
    showPage('products');
    renderProducts();
}

function showAccount() {
    showPage('account');
    document.getElementById('edit-name').value = currentUser.fullName || '';
    document.getElementById('edit-email').value = currentUser.email || '';
}

function showLoyaltyCard() {
    showPage('loyalty');
    generateBarcode();
    updateCardInfo();
}

// Card Flip Function
function flipCard() {
    const card = document.getElementById('loyalty-card');
    const currentRotation = card.style.transform || 'rotateY(0deg)';
    if (currentRotation.includes('180')) {
        card.style.transform = 'rotateY(0deg)';
    } else {
        card.style.transform = 'rotateY(180deg)';
    }
}

// Generate Barcode for Loyalty Card
function generateBarcode() {
    const svg = document.getElementById('barcode-svg');
    if (!svg || !currentUser) return;
    
    const accountId = currentUser.accountId || generateAccountId();
    const barcodeData = accountId.replace(/-/g, '');
    
    let barcodeHTML = '<g fill="white">';
    let x = 0;
    for (let i = 0; i < barcodeData.length && x < 200; i++) {
        const char = barcodeData.charCodeAt(i);
        const width = (char % 3) + 1;
        const height = 60;
        barcodeHTML += `<rect x="${x}" y="0" width="${width}" height="${height}"/>`;
        x += width + 2;
    }
    barcodeHTML += '</g>';
    svg.innerHTML = barcodeHTML;
}

// Generate Account ID
function generateAccountId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 24; i++) {
        if (i > 0 && i % 4 === 0) id += '-';
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// Update Card Info
function updateCardInfo() {
    if (!currentUser) return;
    
    const accountId = currentUser.accountId || generateAccountId();
    currentUser.accountId = accountId;
    
    const accountIdEl = document.getElementById('account-id');
    const cardNameEl = document.getElementById('card-name');
    const cardMemberEl = document.getElementById('card-member-since');
    const backNameEl = document.getElementById('back-name');
    const backEmailEl = document.getElementById('back-email');
    const backPointsEl = document.getElementById('back-points');
    
    if (accountIdEl) accountIdEl.textContent = accountId;
    if (cardNameEl) cardNameEl.textContent = currentUser.fullName || '';
    if (cardMemberEl) cardMemberEl.textContent = currentUser.memberSince || new Date().toLocaleDateString();
    if (backNameEl) backNameEl.textContent = currentUser.fullName || '';
    if (backEmailEl) backEmailEl.textContent = currentUser.email || '';
    if (backPointsEl) backPointsEl.textContent = currentPoints;
    
    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
}

// Set Points Target
function setTarget(target) {
    targetPoints = target;
    updateProgress();
}

// Redeem Reward
function redeemReward(rewardType) {
    const code = generateRewardCode();
    document.getElementById('reward-code').textContent = code;
    document.getElementById('redeem-name').textContent = currentUser.firstName || currentUser.fullName || 'Friend';
    
    // Initialize scratch canvas
    initScratchCanvas();
    
    showPage('redeem');
}

// Generate Reward Code
function generateRewardCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 24; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Initialize Scratch Canvas
function initScratchCanvas() {
    const canvas = document.getElementById('scratch-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#999';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    let isScratching = false;
    let scratchedPixels = 0;
    
    const scratch = (e) => {
        if (!isScratching) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX || e.touches[0].clientX) - rect.left) * (canvas.width / rect.width);
        const y = ((e.clientY || e.touches[0].clientY) - rect.top) * (canvas.height / rect.height);
        
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
        
        scratchedPixels++;
        if (scratchedPixels > 50) {
            canvas.style.display = 'none';
            document.getElementById('code-reveal').classList.remove('hidden');
        }
    };
    
    canvas.addEventListener('mousedown', () => isScratching = true);
    canvas.addEventListener('mousemove', scratch);
    canvas.addEventListener('mouseup', () => isScratching = false);
    canvas.addEventListener('touchstart', () => isScratching = true);
    canvas.addEventListener('touchmove', scratch);
    canvas.addEventListener('touchend', () => isScratching = false);
}

// Exit Redeem
function exitRedeem() {
    showPage('rewards');
}

// FAQ Toggle
function toggleFAQ(faqId) {
    const content = document.getElementById(faqId + '-content');
    const icon = document.getElementById(faqId + '-icon');
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.textContent = '−';
        icon.style.transform = 'rotate(45deg)';
    } else {
        content.classList.add('hidden');
        icon.textContent = '+';
        icon.style.transform = 'rotate(0deg)';
    }
}

// Account Updates
function updateDisplayName() {
    const newName = document.getElementById('edit-name').value;
    if (newName.trim()) {
        const names = newName.split(' ');
        currentUser.firstName = names[0];
        currentUser.lastName = names.slice(1).join(' ') || '';
        currentUser.fullName = newName;
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        document.getElementById('dash-profile-name').textContent = newName;
        alert('Display name updated successfully!');
    }
}

function updateEmail() {
    const newEmail = document.getElementById('edit-email').value;
    if (newEmail.trim() && newEmail.includes('@')) {
        currentUser.email = newEmail;
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        alert('Email updated successfully!');
    } else {
        alert('Please enter a valid email address.');
    }
}

function updatePassword() {
    const newPassword = document.getElementById('edit-pass').value;
    if (newPassword.trim() && newPassword.length >= 6) {
        currentUser.password = newPassword;
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        document.getElementById('edit-pass').value = '';
        alert('Password updated successfully!');
    } else {
        alert('Password must be at least 6 characters long.');
    }
}

// Reset Account
function resetAccount() {
    document.getElementById('reset-modal').classList.remove('hidden');
}

function cancelReset() {
    document.getElementById('reset-modal').classList.add('hidden');
}

function confirmReset() {
    document.getElementById('reset-modal').classList.add('hidden');
    showPage('reset-loading');
    setTimeout(() => {
        localStorage.clear();
        currentUser = null;
        currentPoints = 0;
        showPage('home');
    }, 20000);
}

// Update User Initials
function updateUserInitials() {
    if (!currentUser || !currentUser.firstName || !currentUser.lastName) return;
    
    const userInitialsEl = document.getElementById('user-initials');
    if (userInitialsEl) {
        const initials = `${currentUser.firstName[0]}${currentUser.lastName[0]}`;
        userInitialsEl.textContent = initials.toUpperCase();
    }
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

// Terms Modal Functions
function showTermsModal() {
    document.getElementById('terms-modal').classList.remove('hidden');
}

function closeTermsModal() {
    document.getElementById('terms-modal').classList.add('hidden');
}