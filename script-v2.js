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
let verificationCallback = null;
let verificationCode = null;
let verificationAction = null;
let activeTarget = null;

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
    const continueEmailBtn = document.getElementById('continue-email');
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
    const robloxConnectBtn = document.getElementById('roblox-connect-btn');
    
    if (continueNameBtn) continueNameBtn.addEventListener('click', handleNameSubmit);
    if (continueEmailBtn) continueEmailBtn.addEventListener('click', handleEmailSubmit);
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
    if (robloxConnectBtn) robloxConnectBtn.addEventListener('click', connectRobloxAccount);
    
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
                
                // Check if user exists (userData will have discordId if they exist, or found: false if new)
                if (userData.discordId || (userData.email && userData.accountNumber)) {
                    // User exists, load their data and go straight to dashboard
                    currentUser = {
                        ...user,
                        ...userData, // Spread all user data from database
                        id: user.id, // Discord ID
                        discordId: user.id,
                        discordUsername: user.username,
                        discordAvatar: user.avatar,
                        avatar: user.avatar,
                        username: user.username
                    };
                    currentPoints = userData.points || 0;
                    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
                    localStorage.setItem('points', currentPoints);
                    
                    setTimeout(() => {
                        // Show welcome popup for returning users, then go to dashboard
                        showPage('welcome-popup');
                        welcomeName.textContent = currentUser.fullName || currentUser.firstName || 'back';
                        
                        // Change button text for returning users
                        const dashBtn = document.getElementById('go-dashboard');
                        if (dashBtn) {
                            dashBtn.textContent = 'Go to Dashboard →';
                        }
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
        
        // Update dashboard when showing dashboard page
        if (pageId === 'dashboard' && currentUser) {
            setTimeout(() => {
                const fullName = currentUser.fullName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
                const profileNameEl = document.getElementById('dash-profile-name');
                if (profileNameEl) profileNameEl.textContent = fullName || currentUser.username || 'User';
                
                const memberSinceEl = document.getElementById('member-since');
                if (memberSinceEl) {
                    const date = currentUser.memberSince ? new Date(currentUser.memberSince) : new Date();
                    memberSinceEl.textContent = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }
                
                const availablePointsEl = document.getElementById('available-points');
                if (availablePointsEl) availablePointsEl.textContent = currentPoints || currentUser.points || 0;
            }, 100);
        }
        
        // Update rewards page when showing it
        if (pageId === 'rewards' && currentUser) {
            setTimeout(() => {
                currentPoints = currentUser.points || 0;
                const availablePointsAlt = document.getElementById('available-points-alt');
                if (availablePointsAlt) availablePointsAlt.textContent = currentPoints;
                updateProgress();
            }, 100);
        }
        
        // Update loyalty card when showing loyalty page
        if (pageId === 'loyalty') {
            setTimeout(() => updateLoyaltyCard(), 100);
        }
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
        currentUser = { ...discordUser, firstName: first, lastName: last, fullName: `${first} ${last}`, memberSince: new Date().toDateString() };
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        showPage('create-email');
    } else {
        alert('Please enter both names.');
    }
}

// Email Submit with validation
function handleEmailSubmit() {
    const email = document.getElementById('user-email').value.trim();
    
    // Validate email format: must have @ and a domain
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email) {
        alert('❌ Please enter your email address.');
        return;
    }
    
    if (!email.includes('@')) {
        alert('❌ Email must contain an @ symbol.');
        return;
    }
    
    if (!emailRegex.test(email)) {
        alert('❌ Please enter a valid email address (e.g., name@example.com).');
        return;
    }
    
    // Email is valid, save and continue
    currentUser.email = email;
    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
    showPage('create-pass');
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

// Roblox OAuth Connection
async function connectRobloxAccount() {
    const btn = document.getElementById('roblox-connect-btn');
    const statusText = document.getElementById('roblox-status');
    const infoText = document.getElementById('roblox-info');
    
    // Open Roblox OAuth window
    const width = 600;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    const robloxWindow = window.open(
        `${WORKER_URL}/auth/roblox?state=${currentUser.discordId}`,
        'RobloxAuth',
        `width=${width},height=${height},left=${left},top=${top}`
    );
    
    // Listen for message from popup
    window.addEventListener('message', function robloxCallback(event) {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'ROBLOX_AUTH_SUCCESS') {
            const { username, userId } = event.data;
            
            // Update UI
            document.getElementById('user-roblox').value = username;
            document.getElementById('user-roblox-id').value = userId;
            statusText.textContent = `✅ Connected: ${username}`;
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            infoText.textContent = `✅ Roblox account verified (User ID: ${userId})`;
            infoText.style.color = '#10b981';
            
            // Remove listener
            window.removeEventListener('message', robloxCallback);
            
            if (robloxWindow && !robloxWindow.closed) {
                robloxWindow.close();
            }
        } else if (event.data.type === 'ROBLOX_AUTH_ERROR') {
            alert('Failed to connect Roblox account. Please try again.');
            window.removeEventListener('message', robloxCallback);
        }
    });
}

// Preferences Submit
async function handlePreferencesSubmit() {
    const country = document.getElementById('user-country').value;
    const timezone = document.getElementById('user-timezone').value;
    const language = document.getElementById('user-language').value;
    const robloxUsername = document.getElementById('user-roblox').value;
    const acceptedAge = document.getElementById('accept-age').checked;
    const acceptedMarketing = document.getElementById('accept-marketing').checked;
    const acceptedTerms = document.getElementById('accept-terms').checked;
    
    if (!country || !timezone) {
        alert('Please select your country and timezone.');
        return;
    }
    
    // Roblox is now optional while OAuth app is under review
    // if (!robloxUsername) {
    //     alert('Please enter your Roblox username for product verification.');
    //     return;
    // }
    
    if (!acceptedAge) {
        alert('You must be over 13 years old to use this service.');
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
    currentUser.robloxUsername = robloxUsername;
    currentUser.acceptedAge = true;
    currentUser.acceptedMarketing = acceptedMarketing;
    currentUser.acceptedTerms = true;
    currentUser.termsAcceptedDate = new Date().toISOString();
    localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
    
    // VERIFICATION REQUIRED BEFORE ACCOUNT CREATION
    showVerification(
        '🔐 Verify Your Account',
        'Please enter the verification code sent to your Discord to complete signup.',
        'account creation',
        async (verificationCode) => {
            // Code verified, now proceed with signup
            await completeSignup(country, timezone, language, robloxUsername, acceptedMarketing);
        }
    );
}

// Complete signup after verification
async function completeSignup(country, timezone, language, robloxUsername, acceptedMarketing) {
    showPage('confirm');
    
    // Save to Google Sheets and send welcome DM
    try {
        const signupResponse = await fetch(`${WORKER_URL}/api/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: currentUser.id,
                discordUsername: currentUser.username,
                firstName: currentUser.firstName,
                lastName: currentUser.lastName,
                fullName: currentUser.fullName,
                email: currentUser.email,
                memberSince: currentUser.memberSince,
                country: country,
                timezone: timezone,
                language: language,
                robloxUsername: robloxUsername,
                acceptedMarketing: acceptedMarketing,
                accountNumber: currentUser.accountId || generateAccountId()
            })
        });
        
        const result = await signupResponse.json();
        if (result.success) {
            console.log('User registered successfully');
            if (result.accountNumber) {
                currentUser.accountId = result.accountNumber;
            }
            // Set welcome bonus points
            currentUser.points = 5;
            currentPoints = 5;
            localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
            localStorage.setItem('points', '5');
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

// Refresh user data from API
async function refreshUserData() {
    if (!currentUser || !currentUser.discordId) {
        console.warn('No current user to refresh');
        return false;
    }
    
    try {
        const response = await fetch(`${WORKER_URL}/api/get-user?discordId=${currentUser.discordId}`);
        if (response.ok) {
            const data = await response.json();
            if (data && data.discordId) {
                // Update currentUser with fresh data from API
                currentUser = { ...currentUser, ...data };
                localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
                console.log('✅ User data refreshed:', currentUser.points, 'points');
                return true;
            }
        }
    } catch (error) {
        console.error('Failed to refresh user data:', error);
    }
    return false;
}

// Update all point displays across the application
function updateAllPointDisplays() {
    if (!currentUser) return;
    
    const points = currentUser.points || 0;
    
    // Update dashboard points
    const availablePointsEl = document.getElementById('available-points');
    if (availablePointsEl) availablePointsEl.textContent = points;
    
    // Update rewards page points
    const rewardsPointsEls = document.querySelectorAll('.points-value');
    rewardsPointsEls.forEach(el => el.textContent = points);
    
    // Update loyalty card back points
    const cardPointsBack = document.getElementById('card-points-back');
    if (cardPointsBack) cardPointsBack.textContent = points;
    
    // Update tier displays
    const statTier = document.getElementById('stat-tier');
    let tierName = 'Bronze';
    if (points >= 2000) tierName = 'Diamond';
    else if (points >= 1000) tierName = 'Gold';
    else if (points >= 750) tierName = 'Silver';
    if (statTier) statTier.textContent = tierName;
    
    console.log(`✅ Updated all displays to ${points} points (${tierName} tier)`);
}

// Auto-refresh points every 10 seconds
let pointsRefreshInterval = null;

function startPointsAutoRefresh() {
    // Clear any existing interval
    if (pointsRefreshInterval) {
        clearInterval(pointsRefreshInterval);
    }
    
    // Refresh every 10 seconds
    pointsRefreshInterval = setInterval(async () => {
        if (currentUser && currentUser.discordId) {
            const oldPoints = currentUser.points || 0;
            const refreshed = await refreshUserData();
            if (refreshed) {
                const newPoints = currentUser.points || 0;
                if (newPoints !== oldPoints) {
                    console.log(`🔄 Points changed: ${oldPoints} → ${newPoints}`);
                    updateAllPointDisplays();
                }
            }
        }
    }, 10000); // 10 seconds
}

function stopPointsAutoRefresh() {
    if (pointsRefreshInterval) {
        clearInterval(pointsRefreshInterval);
        pointsRefreshInterval = null;
    }
}

// Show Dashboard
function showDashboard() {
    if (!currentUser) {
        console.warn('No current user, cannot show dashboard');
        return;
    }
    
    console.log('Showing dashboard for user:', currentUser);
    
    // Start auto-refresh when entering dashboard
    startPointsAutoRefresh();
    
    // Refresh user data from API immediately
    refreshUserData().then(refreshed => {
        if (refreshed) {
            updateAllPointDisplays();
        }
    });
    
    // Get time-based greeting
    const hour = new Date().getHours();
    let greeting = 'Good Evening';
    if (hour < 12) greeting = 'Good Morning';
    else if (hour < 18) greeting = 'Good Afternoon';
    
    // Update profile info
    const fullName = currentUser.fullName || `${currentUser.firstName} ${currentUser.lastName}`;
    const profileNameEl = document.getElementById('dash-profile-name');
    const memberSinceEl = document.getElementById('member-since');
    const availablePointsEl = document.getElementById('available-points');
    
    if (profileNameEl) profileNameEl.textContent = fullName;
    if (memberSinceEl) memberSinceEl.textContent = currentUser.memberSince || new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (availablePointsEl) availablePointsEl.textContent = currentUser.points || 0;
    
    // Update greeting in dashboard content
    setTimeout(() => {
        const contentTitle = document.querySelector('.content-title');
        if (contentTitle && contentTitle.textContent === 'Welcome Back!') {
            contentTitle.textContent = `${greeting}, ${currentUser.firstName || fullName.split(' ')[0]}!`;
        }
    }, 100);
    
    // Update stats
    const statRewards = document.getElementById('stat-rewards');
    const statProducts = document.getElementById('stat-products');
    const statTier = document.getElementById('stat-tier');
    
    if (statRewards) statRewards.textContent = '4';
    if (statProducts) statProducts.textContent = '0';
    if (statTier) {
        const points = currentUser.points || 0;
        if (points >= 2000) statTier.textContent = 'Diamond';
        else if (points >= 1000) statTier.textContent = 'Gold';
        else if (points >= 750) statTier.textContent = 'Silver';
        else statTier.textContent = 'Bronze';
    }
    
    // Update initials
    updateUserInitials();
    
    // Generate and save account ID if doesn't exist
    if (!currentUser.accountId) {
        currentUser.accountId = generateAccountId();
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
    }
    
    // Update all user references
    updateCardInfo();
    
    // Show dashboard page and default content
    showPage('dashboard');
    hideAllDashboardContent();
    const dashContent = document.getElementById('dashboard-content');
    if (dashContent) dashContent.classList.remove('hidden');
    updateNavActive('dashboard');
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
    // Update both dashboard and rewards progress bars
    const progressFillMain = document.getElementById('progress-fill');
    const progressFillDashboard = document.getElementById('progress-fill-dashboard');
    
    const percentage = Math.min((currentPoints / targetPoints) * 100, 100);
    
    if (progressFillMain) progressFillMain.style.width = percentage + '%';
    if (progressFillDashboard) progressFillDashboard.style.width = percentage + '%';
    
    // Update target line position
    const targetLine = document.getElementById('target-line');
    if (targetLine && targetPoints > 0) {
        targetLine.style.left = '100%'; // Always show at 100% (the target)
    }
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
    document.getElementById('reset-loading').classList.remove('hidden');
    setTimeout(() => {
        localStorage.clear();
        currentUser = null;
        currentPoints = 0;
        document.getElementById('reset-loading').classList.add('hidden');
        showPage('home');
    }, 20000);
}

// Logout
function handleLogout() {
    document.getElementById('logout-loading').classList.remove('hidden');
    setTimeout(() => {
        localStorage.clear();
        currentUser = null;
        document.getElementById('logout-loading').classList.add('hidden');
        showPage('home');
    }, 3000);
}

// Modern Navigation Functions
function showRewards() {
    // Refresh points before showing rewards
    refreshUserData().then(() => {
        updateAllPointDisplays();
    });
    
    hideAllDashboardContent();
    const rewardsContent = document.getElementById('rewards-content');
    if (rewardsContent) {
        // Show loading state immediately
        rewardsContent.innerHTML = '<div class="text-center py-12"><div class="loading-spinner mx-auto"></div><p class="mt-4 text-gray-600">Loading rewards...</p></div>';
        rewardsContent.classList.remove('hidden');
        
        // Fetch daily reward from API
        fetch(`${WORKER_URL}/api/daily-reward`)
            .then(res => res.json())
            .then(dailyReward => {
                const dailyRewardName = dailyReward.name || 'Free Shipping Voucher';
                const dailyRewardPoints = dailyReward.points || 10;
                
                rewardsContent.innerHTML = `
            <div class="content-header">
                <h2 class="content-title">Rewards & Points</h2>
                <div class="points-display">
                    <span class="points-label">Points</span>
                    <span class="points-value">${currentUser?.points || 0}</span>
                </div>
            </div>
            
            <div class="section-card mb-6">
                <h3 class="section-title">Points Progress</h3>
                <div class="mb-4">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill-dashboard" style="width: 0%"></div>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    <button onclick="setTarget(100)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">100</button>
                    <button onclick="setTarget(200)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">200</button>
                    <button onclick="setTarget(500)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">500</button>
                    <button onclick="setTarget(750)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">750</button>
                    <button onclick="setTarget(1000)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">1000</button>
                    <button onclick="setTarget(1500)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">1500</button>
                    <button onclick="setTarget(2000)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">2000</button>
                </div>
            </div>
            
            <div class="section-card">
                <h3 class="section-title">Available Rewards</h3>
                <div class="rewards-grid">
                    <div class="reward-card featured">
                        <span class="reward-badge">DAILY</span>
                        <div class="reward-icon">🎁</div>
                        <h4 class="reward-title">Daily Reward</h4>
                        <p class="reward-desc">${dailyRewardName} • ${dailyRewardPoints} points</p>
                        <button onclick="redeemReward('Daily Reward', ${dailyRewardPoints}, '${dailyRewardName}')" class="reward-btn">Redeem Now!</button>
                    </div>
                    
                    <div class="reward-card">
                        <span class="reward-badge">750 PTS</span>
                        <div class="reward-icon">🎨</div>
                        <h4 class="reward-title">40% Commission</h4>
                        <p class="reward-desc">40% off a commission</p>
                        <button onclick="redeemReward('Commission Discount', 750)" class="reward-btn">Redeem</button>
                    </div>
                    
                    <div class="reward-card">
                        <span class="reward-badge">1000 PTS</span>
                        <div class="reward-icon">💰</div>
                        <h4 class="reward-title">20% Discount</h4>
                        <p class="reward-desc">20% off next product</p>
                        <button onclick="redeemReward('20% Discount', 1000)" class="reward-btn">Redeem</button>
                    </div>
                    
                    <div class="reward-card">
                        <span class="reward-badge">2000 PTS</span>
                        <div class="reward-icon">🆓</div>
                        <h4 class="reward-title">Free Product</h4>
                        <p class="reward-desc">Get any product for free</p>
                        <button onclick="redeemReward('Free Product', 2000)" class="reward-btn">Redeem</button>
                    </div>
                </div>
            </div>
        `;
                updatePoints();
            })
            .catch(error => {
                console.error('Failed to fetch daily reward:', error);
                // Fallback to default
                showRewardsDefault();
            });
    }
    updateNavActive('rewards');
}

function showRewardsDefault() {
    const rewardsContent = document.getElementById('rewards-content');
    if (!rewardsContent) return;
    
    rewardsContent.innerHTML = `
            <div class="content-header">
                <h2 class="content-title">Rewards & Points</h2>
                <div class="points-display">
                    <span class="points-label">Points</span>
                    <span class="points-value">${currentUser?.points || 0}</span>
                </div>
            </div>
            
            <div class="section-card mb-6">
                <h3 class="section-title">Points Progress</h3>
                <div class="mb-4">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill-dashboard" style="width: 0%"></div>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    <button onclick="setTarget(100)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">100</button>
                    <button onclick="setTarget(200)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">200</button>
                    <button onclick="setTarget(500)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">500</button>
                    <button onclick="setTarget(750)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">750</button>
                    <button onclick="setTarget(1000)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">1000</button>
                    <button onclick="setTarget(1500)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">1500</button>
                    <button onclick="setTarget(2000)" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">2000</button>
                </div>
            </div>
            
            <div class="section-card">
                <h3 class="section-title">Available Rewards</h3>
                <div class="rewards-grid">
                    <div class="reward-card featured">
                        <span class="reward-badge">DAILY</span>
                        <div class="reward-icon">🎁</div>
                        <h4 class="reward-title">Daily Reward</h4>
                        <p class="reward-desc">Free Shipping Voucher • 10 points</p>
                        <button onclick="redeemReward('Daily Reward', 10, 'Free Shipping Voucher')" class="reward-btn">Redeem Now!</button>
                    </div>
                    
                    <div class="reward-card">
                        <span class="reward-badge">750 PTS</span>
                        <div class="reward-icon">🎨</div>
                        <h4 class="reward-title">40% Commission</h4>
                        <p class="reward-desc">40% off a commission</p>
                        <button onclick="redeemReward('Commission Discount', 750)" class="reward-btn">Redeem</button>
                    </div>
                    
                    <div class="reward-card">
                        <span class="reward-badge">1000 PTS</span>
                        <div class="reward-icon">💰</div>
                        <h4 class="reward-title">20% Discount</h4>
                        <p class="reward-desc">20% off next product</p>
                        <button onclick="redeemReward('20% Discount', 1000)" class="reward-btn">Redeem</button>
                    </div>
                    
                    <div class="reward-card">
                        <span class="reward-badge">2000 PTS</span>
                        <div class="reward-icon">🆓</div>
                        <h4 class="reward-title">Free Product</h4>
                        <p class="reward-desc">Get any product for free</p>
                        <button onclick="redeemReward('Free Product', 2000)" class="reward-btn">Redeem</button>
                    </div>
                </div>
            </div>
        `;
    rewardsContent.classList.remove('hidden');
    updatePoints();
    updateNavActive('rewards');
}

function showFAQ() {
    hideAllDashboardContent();
    const faqContent = document.getElementById('faq-content');
    if (faqContent) {
        faqContent.innerHTML = `
            <div class="content-header">
                <h2 class="content-title">Frequently Asked Questions</h2>
            </div>
            
            <div class="section-card">
                <div class="space-y-4">
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">What is MyCirkle?</summary>
                            <div class="mt-3 text-gray-600">
                                <p class="mb-3">MyCirkleDevelopment (commonly referred to as MyCirkle) is an innovative loyalty account program designed to reward both new and returning customers for their continued support and engagement.</p>
                                <p class="mb-3">The primary goal of MyCirkle is to help customers save money and gain extra benefits while engaging with the brand's community-based services.</p>
                                <p>As a loyalty program still in heavy development and BETA testing, MyCirkle will continue to evolve with user feedback, adding new features, rewards, and integrations over time.</p>
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">How do I earn points?</summary>
                            <div class="mt-3 text-gray-600">
                                <p class="mb-2">You can earn points by:</p>
                                <ul class="list-disc list-inside space-y-1 ml-4">
                                    <li>Making purchases from Cirkle Development</li>
                                    <li>Completing tasks and challenges</li>
                                    <li>Participating in events and promotions</li>
                                    <li>Engaging with the community</li>
                                    <li>Claiming your daily rewards</li>
                                </ul>
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">Where do I redeem my rewards?</summary>
                            <div class="mt-3 text-gray-600">
                                <p class="mb-2">To redeem your rewards, please open a ticket in our Discord Server. Our support team will assist you with redemption processing and code verification.</p>
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">How do I get support?</summary>
                            <div class="mt-3 text-gray-600">
                                <p class="mb-2">For general support and redemptions, open a ticket in the Discord Server.</p>
                                <p>For account loss and privacy matters, email: <a href="mailto:mycirkle@cirkledevelopment.co.uk" class="text-blue-600 hover:underline">mycirkle@cirkledevelopment.co.uk</a></p>
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">What can I get with my points?</summary>
                            <div class="mt-3 text-gray-600">
                                <p class="mb-2">Your points can be redeemed for:</p>
                                <ul class="list-disc list-inside space-y-1 ml-4">
                                    <li>Discount codes for future purchases</li>
                                    <li>Free shipping vouchers</li>
                                    <li>Exclusive digital rewards</li>
                                    <li>Special perks and benefits</li>
                                    <li>Early access to new products</li>
                                </ul>
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">Lost Account Details?</summary>
                            <div class="mt-3 text-gray-600">
                                If you've lost your account details, email us at: <a href="mailto:mycirkle@cirkledevelopment.co.uk" class="text-blue-600 hover:underline">mycirkle@cirkledevelopment.co.uk</a> with your Discord username.
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">Is MyCirkle still in development?</summary>
                            <div class="mt-3 text-gray-600">
                                Yes! MyCirkle is constantly evolving with new features, rewards, and improvements based on user feedback.
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">How secure is my account?</summary>
                            <div class="mt-3 text-gray-600">
                                Your account is secured with Discord OAuth authentication and encrypted data storage. We never store sensitive information.
                            </div>
                        </details>
                    </div>
                    
                    <div class="settings-group">
                        <details class="p-4 bg-gray-50 rounded-lg">
                            <summary class="font-semibold cursor-pointer text-black">Terms & Conditions</summary>
                            <div class="mt-3 text-gray-600">
                                <a href="https://shop.cirkledevelopment.co.uk/mycirkle" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700 underline">
                                    View our complete Terms & Conditions
                                </a>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        `;
        faqContent.classList.remove('hidden');
    }
    updateNavActive('faq');
}

function showProducts() {
    hideAllDashboardContent();
    const productsContent = document.getElementById('products-content');
    if (productsContent) {
        productsContent.innerHTML = `
            <div class="content-header">
                <h2 class="content-title">My Products</h2>
                <p class="content-subtitle">Products you've purchased</p>
            </div>
            
            <div class="section-card">
                <div id="products-list-dash" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="text-center py-12 text-gray-500">Loading products...</div>
                </div>
            </div>
        `;
        productsContent.classList.remove('hidden');
        renderProductsToDashboard();
    }
    updateNavActive('products');
}

async function renderProductsToDashboard() {
    const productsListDash = document.getElementById('products-list-dash');
    if (!productsListDash || !currentUser) return;

    try {
        const robloxUsername = currentUser.robloxUsername;
        if (!robloxUsername) {
            productsListDash.innerHTML = `
                <div class="text-center py-12 text-gray-500 col-span-full">
                    <div class="text-6xl mb-4">🎮</div>
                    <p class="text-lg font-semibold mb-2">Roblox Account Not Linked</p>
                    <p class="text-sm">Please add your Roblox username in Settings to see your products.</p>
                </div>
            `;
            return;
        }

        const response = await fetch(`${WORKER_URL}/api/products?robloxUsername=${encodeURIComponent(robloxUsername)}&accountId=${encodeURIComponent(currentUser.accountId || currentUser.discordId)}`);
        
        // Check if response is ok
        if (!response.ok) {
            console.warn('Products API returned:', response.status);
            productsListDash.innerHTML = `
                <div class="text-center py-12 text-gray-500 col-span-full">
                    <div class="text-6xl mb-4">📦</div>
                    <p class="text-lg font-semibold mb-2">No products yet!</p>
                    <p class="text-sm">Your purchased products will appear here.</p>
                </div>
            `;
            return;
        }
        
        const data = await response.json();

        if (data.products && data.products.length > 0) {
            productsListDash.innerHTML = data.products.map(product => `
                <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
                    <div class="text-4xl mb-3 text-center">📦</div>
                    <h3 class="font-semibold text-lg mb-2">${product.name || 'Product'}</h3>
                    <p class="text-sm text-gray-600 mb-3">${product.description || 'Verified ownership'}</p>
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-500">Owned</span>
                        <span class="text-green-600 font-semibold">✓</span>
                    </div>
                </div>
            `).join('');
        } else {
            productsListDash.innerHTML = `
                <div class="text-center py-12 text-gray-500 col-span-full">
                    <div class="text-6xl mb-4">📦</div>
                    <p class="text-lg font-semibold mb-2">No products found</p>
                    <p class="text-sm">Purchase products to see them here!</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading products:', error);
        productsListDash.innerHTML = `
            <div class="text-center py-12 text-gray-500 col-span-full">
                <div class="text-6xl mb-4">📦</div>
                <p class="text-lg font-semibold mb-2">No products yet!</p>
                <p class="text-sm">Your purchased products will appear here.</p>
            </div>
        `;
    }
}

function showAccount() {
    // Refresh points before showing account settings
    refreshUserData().then(() => {
        updateAllPointDisplays();
    });
    
    hideAllDashboardContent();
    const accountContent = document.getElementById('account-content');
    if (accountContent) {
        accountContent.innerHTML = `
            <div class="content-header">
                <h2 class="content-title">Account Settings</h2>
                <p class="content-subtitle">Manage your profile and preferences</p>
            </div>
            
            <div class="section-card mb-4">
                <h3 class="section-title">Account Information</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-xs text-gray-500 mb-1">Account Number</p>
                        <p class="font-mono font-semibold text-black">${currentUser?.accountId || 'N/A'}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-xs text-gray-500 mb-1">Discord Username</p>
                        <p class="font-semibold text-black">${currentUser?.username || 'N/A'}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-xs text-gray-500 mb-1">Member Since</p>
                        <p class="font-semibold text-black">${currentUser?.memberSince || 'N/A'}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-xs text-gray-500 mb-1">Points Balance</p>
                        <p class="font-semibold text-blue-600">${currentUser?.points || 0} points</p>
                    </div>
                </div>
            </div>
            
            <div class="section-card">
                <h3 class="section-title">Update Profile</h3>
                <div class="settings-group">
                    <label class="block text-gray-700 text-sm font-medium mb-2">Display Name</label>
                    <div class="flex gap-2">
                        <input type="text" id="edit-name" class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" value="${currentUser?.fullName || ''}">
                        <button onclick="updateDisplayName()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition">Update</button>
                    </div>
                </div>
                
                <div class="settings-group">
                    <label class="block text-gray-700 text-sm font-medium mb-2">Email</label>
                    <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p class="text-gray-700 font-medium">${currentUser?.email || 'Not provided'}</p>
                        <p class="text-xs text-gray-500 mt-1">🔒 Email cannot be changed for security reasons</p>
                    </div>
                </div>
                
                <div class="settings-group">
                    <label class="block text-gray-700 text-sm font-medium mb-2">Linked Discord Account</label>
                    <div class="linked-account-display">
                        <img src="${currentUser?.avatar ? 'https://cdn.discordapp.com/avatars/' + currentUser.id + '/' + currentUser.avatar + '.png' : 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Discord Avatar">
                        <div class="linked-account-info">
                            <div class="username">${currentUser?.username || 'Not linked'}</div>
                            <div class="display-name">${currentUser?.global_name || currentUser?.username || 'N/A'}</div>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Connected via Discord OAuth</p>
                </div>
                
                <div class="settings-group">
                    <label class="block text-gray-700 text-sm font-medium mb-2">Linked Roblox Account</label>
                    ${currentUser?.robloxUsername ? `
                        <div class="linked-account-display">
                            <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${currentUser.robloxUserId || '1'}&width=150&height=150&format=png" alt="Roblox Avatar" onerror="this.src='https://www.roblox.com/headshot-thumbnail/image?userId=1&width=150&height=150&format=png'">
                            <div class="linked-account-info">
                                <div class="username">${currentUser.robloxUsername}</div>
                                <div class="display-name">User ID: ${currentUser.robloxUserId || 'N/A'}</div>
                            </div>
                        </div>
                    ` : `
                        <div class="bg-gray-100 p-4 rounded-lg border-2 border-dashed border-gray-300 text-center">
                            <p class="text-gray-500 text-sm">🔒 Roblox account not linked yet</p>
                            <p class="text-xs text-gray-400 mt-1">OAuth coming soon after approval</p>
                        </div>
                    `}
                    <p class="text-xs text-gray-500 mt-1">Required for product verification</p>
                </div>
                
                <div class="settings-group">
                    <label class="block text-gray-700 text-sm font-medium mb-2">Change Password</label>
                    <div class="space-y-2">
                        <input type="password" id="edit-old-pass" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" placeholder="Current password">
                        <input type="password" id="edit-new-pass" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" placeholder="New password">
                        <input type="password" id="edit-confirm-pass" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" placeholder="Confirm new password">
                        <button onclick="updatePassword()" class="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition">Update Password</button>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Requires verification code sent to Discord</p>
                </div>
                
                <div class="danger-zone">
                    <h3 class="danger-title">Danger Zone</h3>
                    <p class="danger-subtitle">These actions cannot be undone</p>
                    <button onclick="deleteAccount()" class="danger-btn">Delete Account</button>
                </div>
            </div>
        `;
        accountContent.classList.remove('hidden');
    }
    updateNavActive('account');
}

function showLoyaltyCard() {
    // Refresh points before showing loyalty card
    refreshUserData().then(() => {
        updateAllPointDisplays();
    });
    
    hideAllDashboardContent();
    const loyaltyContent = document.getElementById('loyalty-content');
    if (loyaltyContent) {
        loyaltyContent.innerHTML = `
            <div class="content-header">
                <h2 class="content-title">My Loyalty Card</h2>
                <p class="content-subtitle">Your digital membership card</p>
            </div>
            
            <div class="max-w-2xl mx-auto px-4" style="perspective: 1500px;">
                <div id="loyalty-card" onclick="flipCard()" class="relative w-full cursor-pointer debit-card mx-auto" style="transform-style: preserve-3d; transition: transform 0.8s; aspect-ratio: 1.586; max-width: 500px;">
                    <!-- Front of card -->
                    <div id="card-front" class="absolute w-full h-full rounded-2xl shadow-2xl p-8 text-white debit-card-front flex flex-col justify-between" style="backface-visibility: hidden; transform-style: preserve-3d;">
                        <div class="flex justify-end items-center gap-3">
                            <img src="https://i.postimg.cc/0yVSZyZP/anothermycirklelogo.png" alt="Logo" class="w-12 h-12 object-contain">
                            <h3 class="text-3xl font-bold tracking-wider">MyCirkle</h3>
                        </div>
                        
                        <div class="flex items-center">
                            <div class="w-14 h-11 bg-yellow-400 bg-opacity-80 rounded-md"></div>
                        </div>
                        
                        <div>
                            <p class="text-xs opacity-75 mb-1">CARDHOLDER</p>
                            <p class="text-lg font-bold tracking-wide uppercase" id="card-name-front"></p>
                        </div>
                    </div>
                    
                    <!-- Back of card -->
                    <div id="card-back" class="absolute w-full h-full rounded-2xl shadow-2xl p-8 text-white debit-card-back flex flex-col justify-between" style="backface-visibility: hidden; transform: rotateY(180deg); transform-style: preserve-3d;">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p class="text-xs opacity-75 mb-1">NAME</p>
                                <p class="font-semibold" id="card-name-back"></p>
                            </div>
                            <div>
                                <p class="text-xs opacity-75 mb-1">ISSUE DATE</p>
                                <p class="font-semibold" id="card-issue-date"></p>
                            </div>
                            <div>
                                <p class="text-xs opacity-75 mb-1">TOTAL POINTS</p>
                                <p class="font-bold text-xl" id="card-points-back">0</p>
                            </div>
                            <div>
                                <p class="text-xs opacity-75 mb-1">CARD NUMBER</p>
                                <p class="font-mono text-xs" id="card-number-24"></p>
                            </div>
                        </div>
                        
                        <div class="flex items-center justify-center">
                            <div class="bg-white p-3 rounded-lg w-full max-w-xs">
                                <div id="qr-code-canvas" class="mx-auto" style="width: 150px; height: 150px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <p class="text-center text-sm text-gray-500 mt-6">💳 Click card to flip</p>
            </div>
        `;
        loyaltyContent.classList.remove('hidden');
    }
    updateNavActive('loyalty');
    
    // Update the loyalty card with user data
    setTimeout(() => updateLoyaltyCard(), 100);
}
Perfect. T
function hideAllDashboardContent() {
    const contents = ['dashboard-content', 'rewards-content', 'products-content', 'loyalty-content', 'account-content', 'faq-content'];
    contents.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function updateNavActive(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick')?.includes(page)) {
            item.classList.add('active');
        }
    });
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
    // Generate 24-digit numeric account number
    let id = '';
    for (let i = 0; i < 24; i++) {
        if (i > 0 && i % 4 === 0) id += '-';
        id += Math.floor(Math.random() * 10);
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
    
    // Highlight the selected target button
    const buttons = document.querySelectorAll('[onclick^="setTarget"]');
    buttons.forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-800');
    });
    
    // Highlight clicked button
    event.target.classList.remove('bg-gray-200', 'text-gray-800');
    event.target.classList.add('bg-blue-600', 'text-white');
    
    updateProgress();
    setProgressTarget(target);
}

// Redeem Reward
async function redeemReward(rewardType, customCost, customName) {
    // Define reward costs (can be overridden by parameters)
    const rewards = {
        'Daily Reward': { cost: customCost || 10, name: customName || 'Daily Reward' },
        '20% Discount': { cost: customCost || 1000, name: customName || '20% Product Discount' },
        'Commission Discount': { cost: customCost || 750, name: customName || '40% Commission Discount' },
        'Free Product': { cost: customCost || 2000, name: customName || 'Free Product' }
    };
    
    const reward = rewards[rewardType];
    if (!reward) {
        alert('Invalid reward type');
        return;
    }
    
    // Check if user has enough points
    if (currentPoints < reward.cost) {
        alert(`You need ${reward.cost} points to redeem this reward. You currently have ${currentPoints} points.`);
        return;
    }
    
    // Show loading
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    loadingOverlay.innerHTML = '<div class="bg-white p-8 rounded-lg"><div class="loading-spinner"></div><p class="mt-4">Processing redemption...</p></div>';
    document.body.appendChild(loadingOverlay);
    
    try {
        // Call API to redeem
        const response = await fetch(`${WORKER_URL}/api/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: currentUser.id || currentUser.discordId,
                rewardType: reward.name,
                pointsCost: reward.cost
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update local points
            currentPoints = data.newPoints;
            localStorage.setItem('points', currentPoints);
            updateAllPointDisplays();
            
            // Show reward code
            document.getElementById('reward-code').textContent = data.code;
            document.getElementById('redeem-name').textContent = currentUser.firstName || currentUser.fullName || 'Friend';
            
            // Initialize scratch canvas
            initScratchCanvas();
            
            // Remove loading
            document.body.removeChild(loadingOverlay);
            
            showPage('redeem');
        } else {
            document.body.removeChild(loadingOverlay);
            alert(data.error || 'Redemption failed. Please try again.');
        }
    } catch (error) {
        document.body.removeChild(loadingOverlay);
        console.error('Redemption error:', error);
        alert('Failed to process redemption. Please try again.');
    }
}

// Generate Reward Code
function generateRewardCode() {
    // Generate 24-digit numeric reward code
    let code = '';
    for (let i = 0; i < 24; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += Math.floor(Math.random() * 10);
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

function updateRoblox() {
    const newRoblox = document.getElementById('edit-roblox').value;
    if (newRoblox.trim()) {
        currentUser.robloxUsername = newRoblox;
        localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
        alert('Roblox username updated successfully! Your products will now sync.');
    } else {
        alert('Please enter a valid Roblox username.');
    }
}

function updatePassword() {
    const oldPassword = document.getElementById('edit-old-pass').value;
    const newPassword = document.getElementById('edit-new-pass').value;
    const confirmPassword = document.getElementById('edit-confirm-pass').value;
    
    if (!oldPassword || !newPassword || !confirmPassword) {
        alert('⚠️ Please fill in all password fields.');
        return;
    }
    
    if (currentUser.password && oldPassword !== currentUser.password) {
        alert('❌ Current password is incorrect.');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('⚠️ New password must be at least 6 characters long.');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('❌ New passwords do not match.');
        return;
    }
    
    // Show verification modal
    showVerification(
        '🔐 Verify Password Change',
        'To change your password, please enter the verification code sent to your Discord.',
        () => {
            currentUser.password = newPassword;
            localStorage.setItem('mycirkleUser', JSON.stringify(currentUser));
            document.getElementById('edit-old-pass').value = '';
            document.getElementById('edit-new-pass').value = '';
            document.getElementById('edit-confirm-pass').value = '';
            alert('✅ Password updated successfully!');
        }
    );
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
    document.getElementById('reset-loading').classList.remove('hidden');
    setTimeout(() => {
        localStorage.clear();
        currentUser = null;
        currentPoints = 0;
        document.getElementById('reset-loading').classList.add('hidden');
        showPage('home');
    }, 20000);
}

// Update User Initials
function updateUserInitials() {
    if (!currentUser) return;
    
    const userAvatarEl = document.getElementById('user-avatar-img');
    if (userAvatarEl && currentUser.avatar) {
        // Use avatar URL from OAuth data (already stored in currentUser)
        const avatarUrl = currentUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${currentUser.id || currentUser.discordId}/${currentUser.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;
        userAvatarEl.src = avatarUrl;
    } else if (userAvatarEl) {
        // Fallback to default avatar
        userAvatarEl.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
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

// Mobile Menu Functions
function toggleMobileMenu() {
    const sidebar = document.getElementById('dashboard-sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

function closeMobileMenu() {
    const sidebar = document.getElementById('dashboard-sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('active');
}

// Show mobile menu button on mobile devices
window.addEventListener('resize', () => {
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    if (mobileBtn) {
        mobileBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
    }
});

// Initialize mobile button visibility
document.addEventListener('DOMContentLoaded', () => {
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    if (mobileBtn) {
        mobileBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
    }
});

// ===== NEW FEATURES FOR MYCIRKLE REDESIGN =====

// Copy reward code to clipboard
function copyRewardCode() {
    const codeElement = document.getElementById('reward-code');
    const code = codeElement.textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#3b82f6';
        }, 2000);
    }).catch(err => {
        alert('Failed to copy code');
    });
}

// Generate 24-digit card number
function generate24DigitNumber(accountId) {
    const hash = accountId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let number = '';
    for (let i = 0; i < 24; i++) {
        number += Math.floor((hash * (i + 1)) % 10);
    }
    return number.match(/.{1,4}/g).join(' ');
}

// Get gradient class based on account ID
function getCardGradient(accountId) {
    if (!accountId) return 'gradient-1';
    const hash = accountId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `gradient-${(hash % 10) + 1}`;
}

// Update loyalty card with debit card design
function updateLoyaltyCard() {
    if (!currentUser) return;
    
    const cardFront = document.getElementById('card-front');
    const cardBack = document.getElementById('card-back');
    if (!cardFront || !cardBack) return;
    
    const gradientClass = getCardGradient(currentUser.accountId);
    
    cardFront.className = `absolute w-full h-full rounded-2xl shadow-2xl p-8 text-white debit-card-front flex flex-col justify-between ${gradientClass}`;
    cardBack.className = `absolute w-full h-full rounded-2xl shadow-2xl p-8 text-white debit-card-back flex flex-col justify-between ${gradientClass}`;
    
    // Front
    const cardNameFront = document.getElementById('card-name-front');
    if (cardNameFront) cardNameFront.textContent = currentUser.fullName || 'Guest Member';
    
    // Back
    const cardNameBack = document.getElementById('card-name-back');
    if (cardNameBack) cardNameBack.textContent = currentUser.fullName || 'Guest Member';
    
    const issueDate = document.getElementById('card-issue-date');
    if (issueDate) issueDate.textContent = new Date(currentUser.memberSince || Date.now()).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' });
    
    const cardPoints = document.getElementById('card-points-back');
    if (cardPoints) cardPoints.textContent = currentPoints || currentUser.points || 5;
    
    const cardNumber = document.getElementById('card-number-24');
    // Show actual account number formatted with spaces
    if (cardNumber) {
        const accountNum = currentUser.accountNumber || currentUser.accountId || 'DEFAULT';
        cardNumber.textContent = accountNum.match(/.{1,4}/g)?.join(' ') || accountNum;
    }
    
    generateQRCodeBack();
}

// Generate QR code for card back
function generateQRCodeBack() {
    const qrContainer = document.getElementById('qr-code-canvas');
    if (!qrContainer || !currentUser) return;
    
    // Clear previous QR code
    qrContainer.innerHTML = '';
    
    // Include full account details in QR code
    const qrData = JSON.stringify({
        name: currentUser.fullName || `${currentUser.firstName} ${currentUser.lastName}`,
        email: currentUser.email || '',
        accountNumber: currentUser.accountNumber || currentUser.accountId,
        discordId: currentUser.discordId || currentUser.id,
        discordUsername: currentUser.discordUsername || currentUser.username
    });
    
    // Check if QRCode library is loaded
    if (typeof QRCode !== 'undefined') {
        try {
            // Generate real scannable QR code
            new QRCode(qrContainer, {
                text: qrData,
                width: 150,
                height: 150,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
            console.log('✅ QR Code generated with full account details');
        } catch (error) {
            console.error('QR Code generation error:', error);
            fallbackQRCode(qrContainer, currentUser.accountNumber || currentUser.accountId);
        }
    } else {
        console.warn('QRCode library not loaded, using fallback');
        fallbackQRCode(qrContainer, accountId);
    }
}

// Fallback QR pattern if library fails
function fallbackQRCode(container, accountId) {
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    canvas.id = 'qr-fallback';
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    const size = 150;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'black';
    
    // Create a simple data matrix pattern
    const cellSize = 5;
    const gridSize = Math.floor(size / cellSize);
    
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const hash = (accountId.charCodeAt(i % accountId.length) + i * j) % 2;
            if (hash === 0) {
                ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
            }
        }
    }
    
    // Add finder patterns
    const drawFinderPattern = (x, y) => {
        ctx.fillStyle = 'black';
        ctx.fillRect(x, y, cellSize * 7, cellSize * 7);
        ctx.fillStyle = 'white';
        ctx.fillRect(x + cellSize, y + cellSize, cellSize * 5, cellSize * 5);
        ctx.fillStyle = 'black';
        ctx.fillRect(x + cellSize * 2, y + cellSize * 2, cellSize * 3, cellSize * 3);
    };
    
    drawFinderPattern(0, 0);
    drawFinderPattern(size - cellSize * 7, 0);
    drawFinderPattern(0, size - cellSize * 7);
}

// Progress bar target visualization
function setProgressTarget(targetPoints) {
    activeTarget = targetPoints;
    updateProgressBarTargets();
}

function updateProgressBarTargets() {
    const progressContainers = document.querySelectorAll('.progress-bar-container');
    if (!progressContainers.length || !currentUser) return;
    
    progressContainers.forEach(container => {
        container.querySelectorAll('.progress-target-line, .progress-current-line').forEach(el => el.remove());
        
        if (activeTarget) {
            const currentPoints = currentUser.points || 5;
            const maxPoints = Math.max(activeTarget, currentPoints, 100);
            
            const currentLine = document.createElement('div');
            currentLine.className = 'progress-current-line';
            currentLine.style.left = `${(currentPoints / maxPoints) * 100}%`;
            container.appendChild(currentLine);
            
            const targetLine = document.createElement('div');
            targetLine.className = 'progress-target-line';
            targetLine.style.left = `${(activeTarget / maxPoints) * 100}%`;
            container.appendChild(targetLine);
        }
    });
}

// Verification system
function showVerification(title, message, action, callback) {
    verificationCallback = callback;
    verificationAction = action; // Store the action type
    
    // Send request to generate and send code
    sendVerificationCode(action);
    
    const modal = document.createElement('div');
    modal.className = 'verification-modal';
    modal.innerHTML = `
        <div class="verification-content">
            <h2 class="text-2xl font-bold mb-4 text-gray-800">${title}</h2>
            <p class="text-gray-600 mb-4">${message}</p>
            <p class="text-sm text-blue-600 mb-4">📬 Check your Discord DMs for the verification code</p>
            <input type="text" id="verification-input" class="verification-input" maxlength="6" placeholder="000000">
            <div class="flex gap-3 mt-4">
                <button onclick="cancelVerification()" class="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition">
                    Cancel
                </button>
                <button onclick="submitVerification()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition">
                    Verify
                </button>
            </div>
        </div>
    `;
    modal.id = 'verification-modal';
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('verification-input').focus(), 100);
}

function cancelVerification() {
    const modal = document.getElementById('verification-modal');
    if (modal) modal.remove();
    verificationCallback = null;
    verificationAction = null;
}

async function submitVerification() {
    const input = document.getElementById('verification-input').value;
    
    if (!input || input.length !== 6) {
        alert('❌ Please enter a 6-digit verification code.');
        return;
    }
    
    // For account deletion, skip verification API and let the delete endpoint verify
    if (verificationAction === 'account deletion') {
        console.log('✅ Code entered, calling deletion callback...');
        
        const callback = verificationCallback;
        const code = input;
        
        // Close modal
        cancelVerification();
        
        // Execute callback with code
        if (callback) {
            console.log('Executing deletion with code:', code);
            callback(code);
        } else {
            console.error('⚠️ No callback function was set!');
        }
        return;
    }
    
    // For other actions, verify code with server first
    try {
        const response = await fetch(`${WORKER_URL}/api/verify-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: currentUser.discordId || currentUser.id,
                action: verificationAction,
                code: input
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Verification successful, calling callback...');
            
            // Store callback before clearing
            const callback = verificationCallback;
            const code = input;
            
            // Close modal
            cancelVerification();
            
            // Execute callback AFTER clearing modal
            if (callback) {
                console.log('Executing callback with code:', code);
                callback(code);
            } else {
                console.error('⚠️ No callback function was set!');
            }
        } else {
            alert('❌ ' + (result.error || 'Invalid verification code. Please try again.'));
        }
    } catch (error) {
        console.error('Verification error:', error);
        alert('❌ Failed to verify code. Please try again.');
    }
}

async function sendVerificationCode(action) {
    if (!currentUser) return;
    try {
        const response = await fetch(`${WORKER_URL}/api/send-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: currentUser.discordId || currentUser.id,
                action: action
            })
        });
        
        const result = await response.json();
        if (!result.success) {
            alert('Failed to send verification code. Please try again.');
        }
    } catch (error) {
        console.error('Failed to send verification code:', error);
        alert('Failed to send verification code. Please check your connection.');
    }
}

// Enhanced account deletion
function deleteAccount() {
    showVerification(
        '🔐 Verify Account Deletion',
        'To permanently delete your account, please enter the verification code sent to your Discord.',
        'account deletion',
        confirmAccountDeletion
    );
}

async function confirmAccountDeletion(verificationCode) {
    const modal = document.createElement('div');
    modal.className = 'goodbye-animation';
    modal.innerHTML = `
        <div class="goodbye-content">
            <div class="text-6xl mb-6">⏳</div>
            <h2 class="text-3xl font-bold mb-4">Deleting your account...</h2>
            <p class="text-lg opacity-90">Please wait</p>
        </div>
    `;
    document.body.appendChild(modal);
    
    try {
        const response = await fetch(`${WORKER_URL}/api/delete-account`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discordId: currentUser.discordId || currentUser.id,
                accountId: currentUser.accountId,
                verificationCode: verificationCode
            })
        });
        
        const result = await response.json();
        
        if (!result.success && result.error) {
            throw new Error(result.error);
        }
        
        setTimeout(() => {
            modal.innerHTML = `
                <div class="goodbye-content">
                    <h1>👋</h1>
                    <h2 class="text-4xl font-bold mb-4">We'll miss you!</h2>
                    <p class="text-xl mb-6">Thank you for being part of MyCirkle.</p>
                    <p class="text-lg opacity-90">Your data has been permanently erased.</p>
                    <p class="text-lg opacity-90 mt-4">We hope to see you again soon! ✨</p>
                </div>
            `;
        }, 2000);
        
        setTimeout(() => {
            localStorage.clear();
            window.location.href = '/';
        }, 10000);
    } catch (error) {
        modal.remove();
        alert('Failed to delete account: ' + error.message);
    }
}
