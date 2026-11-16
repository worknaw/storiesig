// ════════════════════════════════════════════════════════════
// StoriesIG - Anonymous Instagram Viewer (Frontend Logic)
// ════════════════════════════════════════════════════════════

// ─── Theme Handler ───
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;
const currentTheme = localStorage.getItem('theme') || 'dark-theme';
body.className = currentTheme;

themeToggle.addEventListener('click', () => {
    if (body.classList.contains('dark-theme')) {
        body.className = 'light-theme';
        localStorage.setItem('theme', 'light-theme');
    } else {
        body.className = 'dark-theme';
        localStorage.setItem('theme', 'dark-theme');
    }
});

// ─── State Variables ───
let activeUser = null;     // { id, username, fullName, avatar, posts[], ... }
let activeStories = [];    // Currently displayed stories in modal
let activeStoryIndex = 0;
let playbackTimer = null;
let progressDuration = 5000;
let isPaused = false;
let startTime = 0;
let remainingTime = 5000;

let activePost = null;
let activeSlideIndex = 0;

// Posts pagination state
let postsNextMaxId = null;
let postsMoreAvailable = false;

// ─── DOM Selectors ───
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const btnClear = document.getElementById('btn-clear');
const btnPaste = document.getElementById('btn-paste');
const btnSearch = document.getElementById('btn-search');
const btnSpinner = document.getElementById('btn-spinner');

const loaderWrapper = document.getElementById('loader-wrapper');
const errorCard = document.getElementById('error-card');
const profileCard = document.getElementById('profile-card');
const resultSection = document.getElementById('result-section');

// Profile DOM
const profileAvatar = document.getElementById('profile-avatar');
const profileUsername = document.getElementById('profile-username');
const profileFullname = document.getElementById('profile-fullname');
const statPosts = document.getElementById('stat-posts');
const statFollowers = document.getElementById('stat-followers');
const statFollowing = document.getElementById('stat-following');
const profileBio = document.getElementById('profile-bio');

// Tabs DOM
const tabStories = document.getElementById('tab-stories');
const tabHighlights = document.getElementById('tab-highlights');
const tabPosts = document.getElementById('tab-posts');
const countStories = document.getElementById('count-stories');
const countHighlights = document.getElementById('count-highlights');
const countPosts = document.getElementById('count-posts');

const highlightsContainer = document.getElementById('highlights-container');
const highlightsTrack = document.getElementById('highlights-track');
const storiesGridContainer = document.getElementById('stories-grid-container');
const storiesGrid = document.getElementById('stories-grid');
const emptyStories = document.getElementById('empty-stories');
const postsGridContainer = document.getElementById('posts-grid-container');
const postsGrid = document.getElementById('posts-grid');
const loadMoreWrapper = document.getElementById('load-more-wrapper');
const btnLoadMore = document.getElementById('btn-load-more');
const loadMoreSpinner = document.getElementById('load-more-spinner');

// Story Modal DOM
const storyModal = document.getElementById('story-modal');
const storyModalOverlay = document.getElementById('story-modal-overlay');
const storyModalAvatar = document.getElementById('story-modal-avatar');
const storyModalUsername = document.getElementById('story-modal-username');
const storyModalTime = document.getElementById('story-modal-time');
const storyProgressContainer = document.getElementById('story-progress-container');
const storyMediaWrapper = document.getElementById('story-media-wrapper');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnStoryPrev = document.getElementById('btn-story-prev');
const btnStoryNext = document.getElementById('btn-story-next');
const btnDownloadStory = document.getElementById('btn-download-story');
const playIcon = btnPlayPause.querySelector('.play-icon');
const pauseIcon = btnPlayPause.querySelector('.pause-icon');

// Post Modal DOM
const postModal = document.getElementById('post-modal');
const postModalOverlay = document.getElementById('post-modal-overlay');
const postModalMedia = document.getElementById('post-modal-media');
const postModalAvatar = document.getElementById('post-modal-avatar');
const postModalUsername = document.getElementById('post-modal-username');
const postModalCaption = document.getElementById('post-modal-caption');
const postModalLikes = document.getElementById('post-modal-likes');
const postModalComments = document.getElementById('post-modal-comments');
const btnDownloadPost = document.getElementById('btn-download-post');
const btnClosePostModal = document.getElementById('btn-close-post-modal');
const postCarouselNav = document.getElementById('post-carousel-nav');
const postCarouselIndicator = document.getElementById('post-carousel-indicator');
const btnPostPrev = document.getElementById('btn-post-prev');
const btnPostNext = document.getElementById('btn-post-next');

// FAQ
const faqItems = document.querySelectorAll('.faq-item');

// ═══════════════════════════════════════
// Input Handling
// ═══════════════════════════════════════
searchInput.addEventListener('input', () => {
    if (searchInput.value.trim().length > 0) {
        btnClear.style.display = 'flex';
        btnPaste.style.display = 'none';
    } else {
        btnClear.style.display = 'none';
        btnPaste.style.display = 'flex';
    }
});

btnClear.addEventListener('click', () => {
    searchInput.value = '';
    btnClear.style.display = 'none';
    btnPaste.style.display = 'flex';
    searchInput.focus();
});

btnPaste.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            const username = extractUsername(text);
            if (username) {
                searchInput.value = username;
                btnClear.style.display = 'flex';
                btnPaste.style.display = 'none';
                searchInput.focus();
            }
        }
    } catch (err) {
        alert('ไม่สามารถอ่านข้อมูลในคลิปบอร์ดได้ โปรดอนุญาตสิทธิ์การเข้าถึง');
    }
});

// Trending badges
document.querySelectorAll('.trend-badge').forEach(badge => {
    badge.addEventListener('click', () => {
        const username = badge.getAttribute('data-username');
        searchInput.value = username;
        btnClear.style.display = 'flex';
        btnPaste.style.display = 'none';
        triggerSearch(username);
    });
});

// Helper: Extract username from raw input (supports profile/story URLs and @ prefixes)
function extractUsername(input) {
    if (!input) return '';
    let cleaned = input.trim();
    
    // Check if it looks like an Instagram URL
    if (cleaned.includes('instagram.com/')) {
        try {
            // Add protocol if missing to allow URL parser to work
            if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
                cleaned = 'https://' + cleaned;
            }
            const urlObj = new URL(cleaned);
            // Get path, e.g. "/username/"
            let path = urlObj.pathname;
            // Remove leading and trailing slashes
            path = path.replace(/^\/+|\/+$/g, '');
            // Split by slash in case there are subpaths (like /username/p/abc)
            const parts = path.split('/');
            if (parts.length > 0 && parts[0]) {
                // If it is a stories URL, e.g., /stories/username/12345/
                if (parts[0] === 'stories' && parts.length > 1) {
                    if (parts[1] !== 'highlights') {
                        return parts[1];
                    }
                }
                return parts[0];
            }
        } catch (e) {
            console.error('URL parsing failed:', e);
        }
    }
    
    // Fallback: Check with regex to find username in case URL parsing failed
    let withoutQuery = cleaned.split('?')[0]; // strip query parameters
    withoutQuery = withoutQuery.replace(/\/+$/, ''); // strip trailing slashes
    
    // Fallback stories check
    const storiesMatch = withoutQuery.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/([a-zA-Z0-9_\.]+)/i);
    if (storiesMatch && storiesMatch[1] && storiesMatch[1] !== 'highlights') {
        return storiesMatch[1];
    }
    
    const match = withoutQuery.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_\.]+)/i);
    if (match && match[1]) {
        return match[1];
    }
    
    // Otherwise, clean any leading @ symbol
    return withoutQuery.replace(/^@/, '');
}

// Search form
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawValue = searchInput.value.trim();
    if (rawValue) triggerSearch(rawValue);
});

// ═══════════════════════════════════════
// Main Search Function (Real API)
// ═══════════════════════════════════════
async function triggerSearch(rawInput) {
    const username = extractUsername(rawInput).toLowerCase();
    if (!username) return;

    // Update input box to display the cleaned username
    searchInput.value = username;
    btnClear.style.display = 'flex';
    btnPaste.style.display = 'none';

    // Hide previous results
    profileCard.style.display = 'none';
    errorCard.style.display = 'none';

    // Show loader
    btnSpinner.style.display = 'inline-block';
    btnSearch.setAttribute('disabled', 'true');
    loaderWrapper.style.display = 'flex';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        // 1) Fetch profile info + posts
        const profileRes = await fetch(`/api/profile?username=${encodeURIComponent(username)}`);
        if (!profileRes.ok) {
            const err = await profileRes.json().catch(() => ({}));
            throw new Error(err.error || 'User not found or private');
        }
        const profileData = await profileRes.json();

        activeUser = {
            id: profileData.id,
            username: profileData.username,
            fullName: profileData.fullName,
            avatar: profileData.avatar,
            isVerified: profileData.isVerified,
            posts: profileData.postsCount,
            followers: profileData.followersCount,
            following: profileData.followingCount,
            bio: profileData.bio,
            postItems: profileData.posts || [],
            nextMaxId: profileData.nextMaxId || null,
            moreAvailable: profileData.moreAvailable || false,
            stories: [],
            highlights: [],
        };

        // 2) Fetch stories and highlights in parallel
        const [storiesRes, highlightsRes] = await Promise.allSettled([
            fetch(`/api/stories?userId=${profileData.id}`),
            fetch(`/api/highlights?userId=${profileData.id}`),
        ]);

        // Parse stories
        if (storiesRes.status === 'fulfilled' && storiesRes.value.ok) {
            const storiesData = await storiesRes.value.json();
            activeUser.stories = storiesData.stories || [];
        }

        // Parse highlights (tray only - stories inside loaded on click)
        if (highlightsRes.status === 'fulfilled' && highlightsRes.value.ok) {
            const highlightsData = await highlightsRes.value.json();
            activeUser.highlights = highlightsData.highlights || [];
        }

        renderProfile(activeUser);

    } catch (error) {
        console.error('Search error:', error);
        errorCard.style.display = 'block';
    } finally {
        btnSpinner.style.display = 'none';
        btnSearch.removeAttribute('disabled');
        loaderWrapper.style.display = 'none';
    }
}

// Demo buttons
document.querySelectorAll('.btn-demo-nasa').forEach(btn => {
    btn.addEventListener('click', () => {
        searchInput.value = 'nasa';
        triggerSearch('nasa');
    });
});
document.querySelectorAll('.btn-demo-natgeo').forEach(btn => {
    btn.addEventListener('click', () => {
        searchInput.value = 'natgeo';
        triggerSearch('natgeo');
    });
});

// ═══════════════════════════════════════
// Render Profile
// ═══════════════════════════════════════
function renderProfile(user) {
    profileAvatar.src = user.avatar;
    profileUsername.textContent = user.username;
    profileFullname.textContent = user.fullName;
    statPosts.textContent = user.posts;
    statFollowers.textContent = user.followers;
    statFollowing.textContent = user.following;
    profileBio.textContent = user.bio;

    countStories.textContent = user.stories.length;
    countHighlights.textContent = user.highlights.length;
    countPosts.textContent = user.posts;

    // Reset pagination state
    postsNextMaxId = user.nextMaxId;
    postsMoreAvailable = user.moreAvailable;

    // Default to stories tab
    setActiveTab('stories');
    profileCard.style.display = 'block';
}

// ═══════════════════════════════════════
// Tab Switching
// ═══════════════════════════════════════
function setActiveTab(tabName) {
    tabStories.className = 'profile-tab' + (tabName === 'stories' ? ' active' : '');
    tabHighlights.className = 'profile-tab' + (tabName === 'highlights' ? ' active' : '');
    tabPosts.className = 'profile-tab' + (tabName === 'posts' ? ' active' : '');

    highlightsContainer.style.display = 'none';
    storiesGridContainer.style.display = 'none';
    postsGridContainer.style.display = 'none';

    if (tabName === 'stories') {
        storiesGridContainer.style.display = 'block';
        renderStoriesGrid(activeUser.stories);
    } else if (tabName === 'highlights') {
        highlightsContainer.style.display = 'block';
        storiesGridContainer.style.display = 'block';
        renderHighlightsTrack(activeUser.highlights);
        renderHighlightsGrid(activeUser.highlights);
    } else if (tabName === 'posts') {
        postsGridContainer.style.display = 'block';
        renderPostsGrid(activeUser.postItems);
    }
}

tabStories.addEventListener('click', () => setActiveTab('stories'));
tabHighlights.addEventListener('click', () => setActiveTab('highlights'));
tabPosts.addEventListener('click', () => setActiveTab('posts'));

// ═══════════════════════════════════════
// Render Stories Grid
// ═══════════════════════════════════════
function renderStoriesGrid(stories) {
    storiesGrid.innerHTML = '';
    if (stories.length === 0) {
        emptyStories.style.display = 'flex';
        storiesGrid.style.display = 'none';
    } else {
        emptyStories.style.display = 'none';
        storiesGrid.style.display = 'grid';

        stories.forEach((story, index) => {
            const card = document.createElement('div');
            card.className = 'story-card';

            const mediaTag = story.type === 'video'
                ? `<video src="${story.url}" class="story-card-media" muted playsinline></video>`
                : `<img src="${story.url}" alt="Story preview" class="story-card-media">`;

            card.innerHTML = `
                ${mediaTag}
                <div class="story-card-overlay">
                    <span class="story-card-time">${story.time}</span>
                    <div class="story-card-play">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                    <button class="story-card-download" data-url="${story.url}" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        ดาวน์โหลด
                    </button>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.story-card-download')) {
                    e.stopPropagation();
                    const url = e.target.closest('.story-card-download').getAttribute('data-url');
                    triggerDownload(url);
                    return;
                }
                openStoryModal(stories, index);
            });

            storiesGrid.appendChild(card);
        });
    }
}

// ═══════════════════════════════════════
// Render Highlights Track + Grid
// ═══════════════════════════════════════
function renderHighlightsTrack(highlights) {
    highlightsTrack.innerHTML = '';
    highlights.forEach((hl) => {
        const bubble = document.createElement('div');
        bubble.className = 'highlight-bubble';
        bubble.innerHTML = `
            <div class="highlight-avatar-wrapper">
                <img src="${hl.cover}" alt="${hl.title}" class="highlight-avatar">
            </div>
            <span class="highlight-title">${hl.title}</span>
        `;
        bubble.addEventListener('click', () => loadHighlightStories(hl.id));
        highlightsTrack.appendChild(bubble);
    });
}

function renderHighlightsGrid(highlights) {
    storiesGrid.innerHTML = '';
    emptyStories.style.display = 'none';

    highlights.forEach((hl) => {
        const card = document.createElement('div');
        card.className = 'story-card';
        card.innerHTML = `
            <img src="${hl.cover}" alt="Highlight cover" class="story-card-media">
            <div class="story-card-overlay">
                <span class="story-card-time">${hl.storiesCount} สตอรี่</span>
                <div class="story-card-play" style="opacity: 1; transform: scale(1);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </div>
                <div style="font-weight: 700; color: #ffffff; text-align: center; margin-top: auto;">${hl.title}</div>
            </div>
        `;
        card.addEventListener('click', () => loadHighlightStories(hl.id));
        storiesGrid.appendChild(card);
    });
}

// Load stories inside a highlight (lazy-loaded on click)
async function loadHighlightStories(highlightId) {
    try {
        const res = await fetch(`/api/highlight-stories?highlightId=${encodeURIComponent(highlightId)}`);
        if (!res.ok) throw new Error('Failed to load highlight stories');
        const data = await res.json();
        if (data.stories && data.stories.length > 0) {
            openStoryModal(data.stories, 0);
        }
    } catch (err) {
        console.error('Highlight load error:', err);
    }
}

// ═══════════════════════════════════════
// Render Posts Grid
// ═══════════════════════════════════════
function appendPostsToGrid(posts) {
    if (!posts || posts.length === 0) return;

    posts.forEach((post) => {
        const card = document.createElement('div');
        card.className = 'post-card';

        // Overlay icons for video/carousel
        let typeIcon = '';
        if (post.isCarousel) {
            typeIcon = `<div class="post-type-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="6" width="15" height="15" rx="2"/><path d="M22 3H8a2 2 0 0 0-2 2v1h13a3 3 0 0 1 3 3v10h0a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" opacity="0.6"/></svg></div>`;
        } else if (post.isVideo) {
            typeIcon = `<div class="post-type-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
        }

        card.innerHTML = `
            <img src="${post.thumbnail}" alt="Post" class="post-card-img">
            ${typeIcon}
            <div class="post-card-overlay">
                <span class="post-card-stat">ถูกใจ ${formatCompact(post.likes)}</span>
                <span class="post-card-stat">ความเห็น ${formatCompact(post.comments)}</span>
            </div>
        `;

        card.addEventListener('click', () => openPostModal(post));
        postsGrid.appendChild(card);
    });
}

function renderPostsGrid(posts) {
    postsGrid.innerHTML = '';
    appendPostsToGrid(posts);

    // Toggle Load More button based on pagination
    if (postsMoreAvailable) {
        loadMoreWrapper.style.display = 'block';
    } else {
        loadMoreWrapper.style.display = 'none';
    }
}

function formatCompact(num) {
    if (!num && num !== 0) return '0';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
}

// ═══════════════════════════════════════
// Download Helper
// ═══════════════════════════════════════
async function triggerDownload(url) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        // Determine extension from content type
        const ext = blob.type.includes('video') ? '.mp4' : '.jpg';
        a.download = `ig-media-${Date.now()}${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
        window.open(url, '_blank');
    }
}

// ═══════════════════════════════════════
// Story Playback Modal
// ═══════════════════════════════════════
function openStoryModal(stories, index) {
    activeStories = stories;
    activeStoryIndex = index;
    isPaused = false;

    storyModalAvatar.src = activeUser.avatar;
    storyModalUsername.textContent = activeUser.username;

    storyProgressContainer.innerHTML = '';
    activeStories.forEach(() => {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        bar.innerHTML = '<div class="story-progress-fill"></div>';
        storyProgressContainer.appendChild(bar);
    });

    storyModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    playStory(activeStoryIndex);
}

function playStory(index) {
    if (index < 0 || index >= activeStories.length) {
        closeStoryModal();
        return;
    }

    activeStoryIndex = index;
    const story = activeStories[index];
    storyModalTime.textContent = story.time;

    if (story.type === 'video') {
        storyMediaWrapper.innerHTML = `<video id="story-video-player" src="${story.url}" autoplay playsinline style="width:100%; height:100%; object-fit:cover;"></video>`;
        progressDuration = 15000;

        const player = document.getElementById('story-video-player');
        player.addEventListener('loadedmetadata', () => {
            progressDuration = player.duration * 1000;
            startProgressTimer(index);
        });
        player.addEventListener('ended', () => {
            playStory(activeStoryIndex + 1);
        });
    } else {
        storyMediaWrapper.innerHTML = `<img src="${story.url}" alt="Story content">`;
        progressDuration = 5000;
        startProgressTimer(index);
    }

    const progressFills = storyProgressContainer.querySelectorAll('.story-progress-fill');
    progressFills.forEach((fill, i) => {
        if (i < index) {
            fill.style.width = '100%';
            fill.style.transition = 'none';
        } else {
            fill.style.width = '0%';
            fill.style.transition = 'none';
        }
    });

    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    isPaused = false;
}

btnDownloadStory.addEventListener('click', (e) => {
    e.preventDefault();
    if (activeStories[activeStoryIndex]) {
        triggerDownload(activeStories[activeStoryIndex].url);
    }
});

function startProgressTimer(index) {
    cancelAnimationFrame(playbackTimer);
    const fill = storyProgressContainer.querySelectorAll('.story-progress-fill')[index];

    startTime = Date.now();
    remainingTime = progressDuration;

    function animate() {
        if (isPaused) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / progressDuration) * 100, 100);
        fill.style.width = `${progress}%`;

        if (elapsed < progressDuration) {
            playbackTimer = requestAnimationFrame(animate);
        } else {
            if (!document.getElementById('story-video-player')) {
                setTimeout(() => playStory(activeStoryIndex + 1), 100);
            }
        }
    }
    playbackTimer = requestAnimationFrame(animate);
}

function pausePlayback() {
    if (isPaused) return;
    isPaused = true;
    cancelAnimationFrame(playbackTimer);

    const player = document.getElementById('story-video-player');
    if (player) player.pause();

    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';

    const elapsed = Date.now() - startTime;
    remainingTime = Math.max(progressDuration - elapsed, 0);
}

function resumePlayback() {
    if (!isPaused) return;
    isPaused = false;

    const player = document.getElementById('story-video-player');
    if (player) player.play();

    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';

    startTime = Date.now() - (progressDuration - remainingTime);

    const index = activeStoryIndex;
    const fill = storyProgressContainer.querySelectorAll('.story-progress-fill')[index];

    function animate() {
        if (isPaused) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / progressDuration) * 100, 100);
        fill.style.width = `${progress}%`;

        if (elapsed < progressDuration) {
            playbackTimer = requestAnimationFrame(animate);
        } else {
            if (!document.getElementById('story-video-player')) {
                setTimeout(() => playStory(activeStoryIndex + 1), 100);
            }
        }
    }
    playbackTimer = requestAnimationFrame(animate);
}

btnPlayPause.addEventListener('click', () => {
    if (isPaused) resumePlayback();
    else pausePlayback();
});

btnStoryPrev.addEventListener('click', () => playStory(activeStoryIndex - 1));
btnStoryNext.addEventListener('click', () => playStory(activeStoryIndex + 1));

storyMediaWrapper.addEventListener('click', (e) => {
    const width = storyMediaWrapper.clientWidth;
    const clickX = e.offsetX;
    if (clickX < width / 3) playStory(activeStoryIndex - 1);
    else playStory(activeStoryIndex + 1);
});

function closeStoryModal() {
    cancelAnimationFrame(playbackTimer);
    const player = document.getElementById('story-video-player');
    if (player) player.pause();
    storyModal.style.display = 'none';
    document.body.style.overflow = '';
}

btnCloseModal.addEventListener('click', closeStoryModal);
storyModalOverlay.addEventListener('click', closeStoryModal);

// ═══════════════════════════════════════
// Post Detail Modal
// ═══════════════════════════════════════
function openPostModal(post) {
    activePost = post;
    activeSlideIndex = 0;

    postModalAvatar.src = activeUser.avatar;
    postModalUsername.textContent = activeUser.username;
    postModalCaption.textContent = post.caption || '';
    postModalLikes.textContent = post.likes?.toLocaleString() || '0';
    postModalComments.textContent = post.comments?.toLocaleString() || '0';

    // Carousel navigation
    if (post.slides && post.slides.length > 1) {
        postCarouselNav.style.display = 'flex';
    } else {
        postCarouselNav.style.display = 'none';
    }

    renderPostSlide(0);
    postModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function renderPostSlide(index) {
    if (!activePost || !activePost.slides) return;
    const slides = activePost.slides;
    if (index < 0 || index >= slides.length) return;

    activeSlideIndex = index;
    const slide = slides[index];

    if (slide.type === 'video') {
        postModalMedia.innerHTML = `<video src="${slide.url}" controls autoplay playsinline style="width:100%; height:100%; object-fit:contain;"></video>`;
    } else {
        postModalMedia.innerHTML = `<img src="${slide.url}" alt="Post media" style="width:100%; height:100%; object-fit:contain;">`;
    }

    postCarouselIndicator.textContent = `${index + 1} / ${slides.length}`;

    // Update download button
    btnDownloadPost.onclick = (e) => {
        e.preventDefault();
        triggerDownload(slide.url);
    };
}

btnPostPrev.addEventListener('click', () => renderPostSlide(activeSlideIndex - 1));
btnPostNext.addEventListener('click', () => renderPostSlide(activeSlideIndex + 1));

function closePostModal() {
    const video = postModalMedia.querySelector('video');
    if (video) video.pause();
    postModal.style.display = 'none';
    document.body.style.overflow = '';
}

btnClosePostModal.addEventListener('click', closePostModal);
postModalOverlay.addEventListener('click', closePostModal);

// ═══════════════════════════════════════
// Keyboard Navigation
// ═══════════════════════════════════════
document.addEventListener('keydown', (e) => {
    // Story modal
    if (storyModal.style.display === 'flex') {
        if (e.key === 'Escape') closeStoryModal();
        else if (e.key === 'ArrowRight') playStory(activeStoryIndex + 1);
        else if (e.key === 'ArrowLeft') playStory(activeStoryIndex - 1);
        return;
    }
    // Post modal
    if (postModal.style.display === 'flex') {
        if (e.key === 'Escape') closePostModal();
        else if (e.key === 'ArrowRight') renderPostSlide(activeSlideIndex + 1);
        else if (e.key === 'ArrowLeft') renderPostSlide(activeSlideIndex - 1);
        return;
    }
});

// ═══════════════════════════════════════
// Touch / Swipe Support
// ═══════════════════════════════════════
let touchStartX = 0;
let touchEndX = 0;

storyModal.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    pausePlayback();
}, { passive: true });

storyModal.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const threshold = 50;
    if (touchStartX - touchEndX > threshold) playStory(activeStoryIndex + 1);
    else if (touchEndX - touchStartX > threshold) playStory(activeStoryIndex - 1);
    else resumePlayback();
}, { passive: true });

// ═══════════════════════════════════════
// FAQ Accordion
// ═══════════════════════════════════════
faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    const panel = item.querySelector('.faq-panel');

    trigger.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        faqItems.forEach(i => {
            i.classList.remove('active');
            i.querySelector('.faq-panel').style.maxHeight = null;
        });

        if (!isActive) {
            item.classList.add('active');
            panel.style.maxHeight = panel.scrollHeight + 'px';
        }
    });
});

// ═══════════════════════════════════════
// Load More Posts
// ═══════════════════════════════════════
btnLoadMore.addEventListener('click', async () => {
    if (!activeUser || !postsNextMaxId) return;

    btnLoadMore.setAttribute('disabled', 'true');
    loadMoreSpinner.style.display = 'inline-block';

    try {
        const res = await fetch(`/api/posts?userId=${activeUser.id}&maxId=${encodeURIComponent(postsNextMaxId)}`);
        if (!res.ok) {
            throw new Error('Failed to load more posts');
        }
        const data = await res.json();
        const newPosts = data.posts || [];

        // Append to state list
        activeUser.postItems.push(...newPosts);

        // Render newly added posts to grid
        appendPostsToGrid(newPosts);

        // Update pagination cursors
        postsNextMaxId = data.nextMaxId;
        postsMoreAvailable = data.moreAvailable;

        // Toggle button visibility based on moreAvailable
        if (postsMoreAvailable) {
            loadMoreWrapper.style.display = 'block';
        } else {
            loadMoreWrapper.style.display = 'none';
        }
    } catch (err) {
        console.error('Error loading more posts:', err);
        alert('ไม่สามารถโหลดโพสต์เพิ่มเติมได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
    } finally {
        btnLoadMore.removeAttribute('disabled');
        loadMoreSpinner.style.display = 'none';
    }
});

// ════════════════════════════════════════════════════════════
// Multi-Tool Routing & Landing Switcher (SPA Router)
// ════════════════════════════════════════════════════════════
const views = document.querySelectorAll('.tool-view');
const navLinkViewer = document.getElementById('nav-link-viewer');
const navLinkUnfollowers = document.getElementById('nav-link-unfollowers');
const navLinkRecentFollowers = document.getElementById('nav-link-recent-followers');

function handleRouting() {
    const hash = window.location.hash || '#/';
    
    // Hide all views first
    views.forEach(v => v.style.display = 'none');
    
    // Deactivate all nav links
    navLinkViewer.classList.remove('active');
    navLinkUnfollowers.classList.remove('active');
    navLinkRecentFollowers.classList.remove('active');
    
    if (hash === '#/viewer' || hash.startsWith('#/viewer/')) {
        // Show Viewer View
        document.getElementById('viewer-view').style.display = 'block';
        navLinkViewer.classList.add('active');
        
        // Optional: Trigger query if URL contains user
        // e.g. #/viewer/nasa
        const parts = hash.split('/');
        if (parts.length > 2 && parts[2]) {
            const user = decodeURIComponent(parts[2]);
            searchInput.value = user;
            triggerSearch(user);
        }
    } else if (hash === '#/unfollowers') {
        // Show Unfollowers View
        document.getElementById('unfollowers-view').style.display = 'block';
        navLinkUnfollowers.classList.add('active');
        
        // Notify opener that we are ready to receive bookmarklet data
        if (window.opener) {
            window.opener.postMessage({ type: 'storiesig_ready' }, '*');
        }
    } else if (hash === '#/recent-followers') {
        document.getElementById('recent-followers-view').style.display = 'block';
        navLinkRecentFollowers.classList.add('active');

        if (window.opener) {
            window.opener.postMessage({ type: 'storiesig_recent_followers_ready' }, '*');
        }
    } else {
        // Default: Landing Page View
        document.getElementById('landing-view').style.display = 'block';
    }
}

// Router Listeners
window.addEventListener('hashchange', handleRouting);
window.addEventListener('DOMContentLoaded', handleRouting);

// Landing Cards Clicks
document.getElementById('card-viewer').addEventListener('click', () => {
    window.location.hash = '#/viewer';
});
document.getElementById('card-unfollowers').addEventListener('click', () => {
    window.location.hash = '#/unfollowers';
});
document.getElementById('card-recent-followers').addEventListener('click', () => {
    window.location.hash = '#/recent-followers';
});

// Brand Logo click resets to landing
document.getElementById('brand-logo').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#/';
});


// ════════════════════════════════════════════════════════════
// Unfollowers Tracker Logic
// ════════════════════════════════════════════════════════════
const ufForm = document.getElementById('unfollowers-form');
const ufInput = document.getElementById('unfollowers-input');
const btnUfClear = document.getElementById('btn-unfollowers-clear');
const btnUfPaste = document.getElementById('btn-unfollowers-paste');
const btnUfSearch = document.getElementById('btn-unfollowers-search');
const btnUfSpinner = document.getElementById('btn-unfollowers-spinner');

const ufResultSection = document.getElementById('unfollowers-result-section');
const ufProfileCard = document.getElementById('unfollowers-profile-card');
const ufProgressCard = document.getElementById('uf-progress-card');
const ufResultsPanel = document.getElementById('uf-results-panel');
const ufErrorCard = document.getElementById('uf-error-card');
const ufErrorDesc = document.getElementById('uf-error-desc');

const ufAvatar = document.getElementById('uf-profile-avatar');
const ufUsername = document.getElementById('uf-profile-username');
const ufFullname = document.getElementById('uf-profile-fullname');
const ufStatus = document.getElementById('uf-profile-status');
const btnStartCheck = document.getElementById('btn-start-check');
const btnStopCheck = document.getElementById('btn-stop-check');

const ufFollowersLoaded = document.getElementById('uf-followers-loaded');
const ufFollowingLoaded = document.getElementById('uf-following-loaded');
const ufFollowersBar = document.getElementById('uf-followers-bar');
const ufFollowingBar = document.getElementById('uf-following-bar');
const ufProgressStatus = document.getElementById('uf-progress-status');
const ufProgressTitle = document.getElementById('uf-progress-title');

const badgeUnfollowers = document.getElementById('badge-unfollowers');
const badgeFans = document.getElementById('badge-fans');
const badgeMutual = document.getElementById('badge-mutual');
const ufUsersGrid = document.getElementById('uf-users-grid');
const ufListEmpty = document.getElementById('uf-list-empty');

let ufTargetUser = null; // { pk, username, fullName, avatar, isPrivate, followerCount, followingCount }
let ufFollowers = [];
let ufFollowing = [];
let ufIsRunning = false;
let ufIsCancelled = false;
let ufActiveTab = 'unfollowers';
let ufScanIncomplete = false;

// Input cleanup handlers
if (ufInput) {
    ufInput.addEventListener('input', () => {
        if (ufInput.value.trim().length > 0) {
            btnUfClear.style.display = 'flex';
            btnUfPaste.style.display = 'none';
        } else {
            btnUfClear.style.display = 'none';
            btnUfPaste.style.display = 'flex';
        }
    });
}

if (btnUfClear) {
    btnUfClear.addEventListener('click', () => {
        ufInput.value = '';
        btnUfClear.style.display = 'none';
        btnUfPaste.style.display = 'flex';
        ufInput.focus();
    });
}

if (btnUfPaste) {
    btnUfPaste.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const cleaned = extractUsername(text);
                if (cleaned) {
                    ufInput.value = cleaned;
                    btnUfClear.style.display = 'flex';
                    btnUfPaste.style.display = 'none';
                    ufInput.focus();
                }
            }
        } catch (e) {
            alert('ไม่สามารถวางได้ กรุณาอนุญาตสิทธิ์การเข้าถึงคลิปบอร์ด');
        }
    });
}

// Search User Submit
if (ufForm) {
    ufForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rawVal = ufInput.value.trim();
        if (!rawVal) return;

        // Reset views
        ufResultSection.style.display = 'block';
        ufProfileCard.style.display = 'none';
        ufProgressCard.style.display = 'none';
        ufResultsPanel.style.display = 'none';
        ufErrorCard.style.display = 'none';

        // Show loading
        btnUfSpinner.style.display = 'inline-block';
        btnUfSearch.setAttribute('disabled', 'true');

        try {
            const username = extractUsername(rawVal).toLowerCase();
            // Clean display
            ufInput.value = username;

            const res = await fetch(`/api/search-user?username=${encodeURIComponent(username)}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'ไม่พบผู้ใช้หรือเกิดข้อผิดพลาดในการโหลดข้อมูล');
            }

            ufTargetUser = await res.json();
            
            // Show Profile Card
            ufAvatar.src = ufTargetUser.avatar || '';
            ufUsername.textContent = `@${ufTargetUser.username}`;
            ufFullname.textContent = ufTargetUser.fullName || ufTargetUser.username;

            if (ufTargetUser.isPrivate) {
                ufStatus.textContent = 'บัญชีส่วนตัว (ไม่สามารถสแกนได้)';
                ufStatus.className = 'badge badge-private';
                btnStartCheck.style.display = 'none';
                alert('บัญชีนี้เป็นบัญชีส่วนตัว บอทไม่สามารถเข้าถึงรายชื่อผู้ติดตามได้ กรุณาใช้บัญชีที่เป็นสาธารณะเท่านั้น');
            } else {
                ufStatus.textContent = `บัญชีสาธารณะ (ผู้ติดตาม ~${ufTargetUser.followerCount.toLocaleString()} คน)`;
                ufStatus.className = 'badge badge-public';
                btnStartCheck.style.display = 'inline-block';
            }

            ufProfileCard.style.display = 'flex';
            ufProfileCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            console.error('[Unfollowers Search] Error:', err);
            ufErrorDesc.textContent = err.message;
            ufErrorCard.style.display = 'flex';
        } finally {
            btnUfSpinner.style.display = 'none';
            btnUfSearch.removeAttribute('disabled');
        }
    });
}

// Sleep helper
const randomDelay = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

// UUID Generator for rankToken session
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Friendships API Fetcher (page-by-page loop)
async function fetchFriendshipList(userId, listType, targetTotal, progressCallback) {
    let list = [];
    let nextMaxId = '';
    let hasMore = true;
    const rankToken = generateUUID();

    while (hasMore && !ufIsCancelled) {
        let url = `/api/friendships?userId=${userId}&list=${listType}&rankToken=${rankToken}`;
        if (nextMaxId) {
            url += `&maxId=${encodeURIComponent(nextMaxId)}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `ไม่สามารถดึงข้อมูลรายการ ${listType} ได้`);
        }

        const data = await res.json();
        const users = data.users || [];
        list.push(...users);
        nextMaxId = data.next_max_id;
        hasMore = !!(nextMaxId && nextMaxId !== '0' && nextMaxId !== 0);

        // Callback with loaded count
        progressCallback(list.length);

        if (hasMore && !ufIsCancelled) {
            // Delay 800-1500ms to avoid rate limiting
            const delayTime = Math.floor(Math.random() * (1500 - 800)) + 800;
            ufProgressStatus.textContent = `หน่วงเวลาความปลอดภัย ${delayTime}ms เพื่อป้องกันการโดนบล็อก...`;
            await randomDelay(800, 1500);
        }
    }

    return list;
}

// Start Checks
if (btnStartCheck) {
    btnStartCheck.addEventListener('click', async () => {
        if (!ufTargetUser || ufIsRunning) return;

        ufIsRunning = true;
        ufIsCancelled = false;
        ufScanIncomplete = false;
        ufFollowers = [];
        ufFollowing = [];

        // Hide profile selection, show progress card
        ufProfileCard.style.display = 'none';
        ufProgressCard.style.display = 'block';
        btnStopCheck.style.display = 'inline-block';

        // Reset counters and progress bars
        ufFollowersLoaded.textContent = '0';
        ufFollowingLoaded.textContent = '0';
        ufFollowersBar.style.width = '0%';
        ufFollowingBar.style.width = '0%';
        ufProgressTitle.textContent = `กำลังวิเคราะห์ความสัมพันธ์ของ @${ufTargetUser.username}`;

        try {
            const userId = ufTargetUser.pk;
            const totalFollowers = ufTargetUser.followerCount || 1;
            const totalFollowing = ufTargetUser.followingCount || 1;

            // 1. Fetch Followers
            ufProgressStatus.textContent = 'กำลังเริ่มต้นดึงรายชื่อผู้ติดตาม (Followers)...';
            ufFollowers = await fetchFriendshipList(userId, 'followers', totalFollowers, (loaded) => {
                ufFollowersLoaded.textContent = loaded;
                const pct = Math.min(100, Math.floor((loaded / totalFollowers) * 100));
                ufFollowersBar.style.width = `${pct}%`;
                ufProgressStatus.textContent = `ดึงข้อมูลผู้ติดตามแล้ว ${loaded} คน...`;
            });

            if (ufIsCancelled) throw new Error('การสแกนรายชื่อถูกยกเลิกโดยผู้ใช้');

            // Delay between lists
            ufProgressStatus.textContent = 'สลับดึงข้อมูลรายการถัดไป พักระบบ 2 วินาที...';
            await randomDelay(2000, 2500);

            // 2. Fetch Following
            ufProgressStatus.textContent = 'กำลังดึงรายชื่อคนที่คุณติดตาม (Following)...';
            ufFollowing = await fetchFriendshipList(userId, 'following', totalFollowing, (loaded) => {
                ufFollowingLoaded.textContent = loaded;
                const pct = Math.min(100, Math.floor((loaded / totalFollowing) * 100));
                ufFollowingBar.style.width = `${pct}%`;
                ufProgressStatus.textContent = `ดึงข้อมูลคนที่คุณติดตามแล้ว ${loaded} คน...`;
            });

            // Finished
            ufProgressStatus.textContent = 'วิเคราะห์เปรียบเทียบข้อมูลรายชื่อเสร็จสิ้น!';
            btnStopCheck.style.display = 'none';

            await randomDelay(1000, 1200);
            
            // Render results
            ufProgressCard.style.display = 'none';
            renderUnfollowersResults();

        } catch (err) {
            console.error('[Scan Unfollowers] Failed:', err);
            ufProgressStatus.textContent = `สแกนหยุดชะงัก: ${err.message}`;
            btnStopCheck.style.display = 'none';
            ufScanIncomplete = true;

            // Even if cancelled or partially failed, if we have some data, allow displaying it
            if (ufFollowers.length > 0 || ufFollowing.length > 0) {
                alert(`ดึงข้อมูลเสร็จสิ้นบางส่วน (${ufFollowers.length} followers, ${ufFollowing.length} following) จะแสดงเท่าที่มี`);
                await randomDelay(1500, 2000);
                ufProgressCard.style.display = 'none';
                renderUnfollowersResults();
            } else {
                ufErrorDesc.textContent = err.message;
                ufErrorCard.style.display = 'flex';
            }
        } finally {
            ufIsRunning = false;
        }
    });
}

// Stop check trigger
if (btnStopCheck) {
    btnStopCheck.addEventListener('click', () => {
        ufIsCancelled = true;
        ufProgressStatus.textContent = 'กำลังหยุดการประมวลผลด่วน...';
        btnStopCheck.setAttribute('disabled', 'true');
        btnStopCheck.textContent = 'กำลังหยุด...';
    });
}

// Process Lists & Render Results Panel
function renderUnfollowersResults() {
    // 1. Map to sets for comparison
    const followerUsernames = ufFollowers
        .filter(f => f && typeof f.username === 'string')
        .map(f => f.username.trim().toLowerCase());
    const followingUsernames = ufFollowing
        .filter(f => f && typeof f.username === 'string')
        .map(f => f.username.trim().toLowerCase());

    const followerSet = new Set(followerUsernames);
    const followingSet = new Set(followingUsernames);

    // Extra safety check: if we got 0 or significantly fewer followers/following than target profile has, flag as incomplete
    if (ufTargetUser) {
        const expectedFollowers = ufTargetUser.followerCount || 0;
        const expectedFollowing = ufTargetUser.followingCount || 0;
        
        if ((ufFollowers.length === 0 && expectedFollowers > 5) || 
            (ufFollowing.length === 0 && expectedFollowing > 5) ||
            (ufFollowers.length < expectedFollowers * 0.5 && expectedFollowers > 10) ||
            (ufFollowing.length < expectedFollowing * 0.5 && expectedFollowing > 10)) {
            ufScanIncomplete = true;
        }
    }

    // Filter categories
    // 1. Not following back: We follow them, but they don't follow us
    window.ufNotFollowingMeBackList = ufFollowing.filter(f => f && f.username && !followerSet.has(f.username.trim().toLowerCase()));
    
    // 2. Fans (I don't follow back): They follow us, but we don't follow them
    window.ufPeopleIDontFollowBackList = ufFollowers.filter(f => f && f.username && !followingSet.has(f.username.trim().toLowerCase()));

    // 3. Mutual followers
    window.ufMutualList = ufFollowing.filter(f => f && f.username && followerSet.has(f.username.trim().toLowerCase()));

    // Update tab badges
    badgeUnfollowers.textContent = window.ufNotFollowingMeBackList.length;
    badgeFans.textContent = window.ufPeopleIDontFollowBackList.length;
    badgeMutual.textContent = window.ufMutualList.length;

    // Toggle warning banner if scan was incomplete
    const warningBanner = document.getElementById('uf-warning-banner');
    if (warningBanner) {
        warningBanner.style.display = ufScanIncomplete ? 'block' : 'none';
    }

    // Show Results Panel
    document.getElementById('uf-result-target-user').textContent = `@${ufTargetUser.username}`;
    ufResultsPanel.style.display = 'block';
    ufResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Render active tab
    renderUfActiveTab();
}

// Tab switcher handler
document.querySelectorAll('.uf-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.uf-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ufActiveTab = btn.getAttribute('data-tab');
        renderUfActiveTab();
    });
});

// Render specific tab list
function renderUfActiveTab() {
    ufUsersGrid.innerHTML = '';
    let activeList = [];

    if (ufActiveTab === 'unfollowers') {
        activeList = window.ufNotFollowingMeBackList || [];
    } else if (ufActiveTab === 'fans') {
        activeList = window.ufPeopleIDontFollowBackList || [];
    } else if (ufActiveTab === 'mutual') {
        activeList = window.ufMutualList || [];
    }

    if (activeList.length === 0) {
        ufListEmpty.style.display = 'block';
    } else {
        ufListEmpty.style.display = 'none';
        
        activeList.forEach(user => {
            const card = document.createElement('div');
            card.className = 'uf-user-item';
            const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[char]);
            const username = String(user.username || '');

            card.innerHTML = `
                <div class="uf-profile-info">
                    <img src="${escapeHtml(user.avatar || 'https://via.placeholder.com/150')}" alt="Avatar" class="uf-user-avatar" onerror="this.src='https://via.placeholder.com/150'">
                    <div class="uf-user-meta">
                        <h4 class="uf-user-username">@${escapeHtml(username)}</h4>
                        <p class="uf-user-fullname">${escapeHtml(user.fullName || username)}</p>
                    </div>
                </div>
                <div class="uf-user-actions">
                    <button class="btn-action-sm btn-uf-lookup" title="ส่องไอจีของคนนี้">ส่องไอจี</button>
                    <a href="https://instagram.com/${encodeURIComponent(username)}" target="_blank" rel="noopener noreferrer" class="btn-action-sm btn-uf-ig" title="เปิดใน Instagram">เปิด IG</a>
                </div>
            `;

            // Action lookup listener (bind directly in SPA)
            card.querySelector('.btn-uf-lookup').addEventListener('click', () => {
                const searchUser = username;
                // Switch hash to viewer and let router trigger search
                window.location.hash = `#/viewer/${encodeURIComponent(searchUser)}`;
            });

            ufUsersGrid.appendChild(card);
        });
    }
}

// Copy Usernames to Clipboard
const btnUfCopy = document.getElementById('btn-uf-copy');
if (btnUfCopy) {
    btnUfCopy.addEventListener('click', () => {
        let activeList = [];
        if (ufActiveTab === 'unfollowers') activeList = window.ufNotFollowingMeBackList || [];
        else if (ufActiveTab === 'fans') activeList = window.ufPeopleIDontFollowBackList || [];
        else if (ufActiveTab === 'mutual') activeList = window.ufMutualList || [];

        if (activeList.length === 0) {
            alert('ไม่มีรายชื่อให้คัดลอก');
            return;
        }

        const usernames = activeList.map(u => u.username).join(', ');
        navigator.clipboard.writeText(usernames).then(() => {
            alert(`คัดลอกรายชื่อทั้งหมดในแท็บนี้ (${activeList.length} คน) ลงในคลิปบอร์ดแล้ว!`);
        }).catch(e => {
            console.error('Copy failed:', e);
            alert('ไม่สามารถคัดลอกรายชื่อได้โดยอัตโนมัติ');
        });
    });
}

// Export Usernames to TXT
const btnUfExport = document.getElementById('btn-uf-export');
if (btnUfExport) {
    btnUfExport.addEventListener('click', () => {
        let activeList = [];
        let title = '';
        if (ufActiveTab === 'unfollowers') {
            activeList = window.ufNotFollowingMeBackList || [];
            title = 'คนที่ไม่ได้ฟอลคุณกลับ (Unfollowers)';
        } else if (ufActiveTab === 'fans') {
            activeList = window.ufPeopleIDontFollowBackList || [];
            title = 'คนที่คุณไม่ได้ฟอลกลับ (Fans)';
        } else if (ufActiveTab === 'mutual') {
            activeList = window.ufMutualList || [];
            title = 'ฟอลโลว์ซึ่งกันและกัน (Mutual)';
        }

        if (activeList.length === 0) {
            alert('ไม่มีรายชื่อให้ดาวน์โหลด');
            return;
        }

        const contentLines = [
            `==================================================`,
            ` ผลลัพธ์: ${title} - บัญชี @${ufTargetUser.username}`,
            ` วันที่ดึงข้อมูล: ${new Date().toLocaleString('th-TH')}`,
            ` จำนวนรายชื่อทั้งหมด: ${activeList.length} คน`,
            `==================================================\r\n`
        ];

        activeList.forEach((u, i) => {
            contentLines.push(`${i + 1}. @${u.username} (${u.fullName || ''})`);
        });

        const fileContent = contentLines.join('\r\n');
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `instagram-${ufTargetUser.username}-${ufActiveTab}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

// ════════════════════════════════════════════════════════════
// Bookmarklet Method - Tab Switching, Code Generation & Data Reception
// ════════════════════════════════════════════════════════════

// Method Tab Elements
const methodTabBookmarklet = document.getElementById('method-tab-bookmarklet');
const methodTabBot = document.getElementById('method-tab-bot');
const methodTabImport = document.getElementById('method-tab-import');
const methodBookmarkletContainer = document.getElementById('method-bookmarklet-container');
const methodBotContainer = document.getElementById('method-bot-container');
const methodImportContainer = document.getElementById('method-import-container');

// Method Tab Switching
if (methodTabBookmarklet && methodTabBot) {
    const switchMethod = (method) => {
        // Toggle active state on tabs
        methodTabBookmarklet.classList.toggle('active', method === 'bookmarklet');
        methodTabBot.classList.toggle('active', method === 'bot');
        methodTabImport.classList.toggle('active', method === 'import');
        
        // Show/hide containers
        if (methodBookmarkletContainer) {
            methodBookmarkletContainer.style.display = method === 'bookmarklet' ? 'block' : 'none';
        }
        if (methodBotContainer) {
            methodBotContainer.style.display = method === 'bot' ? 'block' : 'none';
        }
        if (methodImportContainer) {
            methodImportContainer.style.display = method === 'import' ? 'block' : 'none';
        }
    };

    methodTabBookmarklet.addEventListener('click', () => switchMethod('bookmarklet'));
    methodTabBot.addEventListener('click', () => switchMethod('bot'));
    methodTabImport.addEventListener('click', () => switchMethod('import'));
}

function parseInstagramRelationships(data, type) {
    const keys = type === 'followers'
        ? ['relationships_followers', 'followers', 'followers_1']
        : ['relationships_following', 'following'];
    const entries = Array.isArray(data) ? data : keys.map(key => data?.[key]).find(Array.isArray);
    if (!Array.isArray(entries)) {
        throw new Error(`รูปแบบไฟล์ ${type} ไม่ถูกต้อง กรุณาเลือกไฟล์ JSON จากข้อมูล Instagram`);
    }
    return entries.map(entry => {
        const value = entry?.string_list_data?.[0]?.value || entry?.title;
        return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
    }).filter(username => /^[a-zA-Z0-9._]{1,30}$/.test(username))
        .map(username => ({ username, fullName: '', avatar: '' }));
}

const ufImportForm = document.getElementById('uf-import-form');
if (ufImportForm) {
    ufImportForm.addEventListener('submit', async event => {
        event.preventDefault();
        const errorEl = document.getElementById('uf-import-error');
        const followersFiles = [...document.getElementById('uf-import-followers').files];
        const followingFile = document.getElementById('uf-import-following').files[0];
        const submitButton = ufImportForm.querySelector('button[type="submit"]');
        errorEl.style.display = 'none';
        submitButton.disabled = true;
        try {
            if (!followersFiles.length || !followingFile) throw new Error('กรุณาเลือกไฟล์ผู้ติดตามและไฟล์ที่กำลังติดตาม');
            const followers = (await Promise.all(followersFiles.map(async file =>
                parseInstagramRelationships(JSON.parse(await file.text()), 'followers')))).flat();
            const following = parseInstagramRelationships(JSON.parse(await followingFile.text()), 'following');
            const unique = users => [...new Map(users.map(user => [user.username.toLowerCase(), user])).values()];
            ufFollowers = unique(followers);
            ufFollowing = unique(following);
            const name = document.getElementById('uf-import-username').value.trim().replace(/^@/, '');
            ufTargetUser = {
                pk: 0,
                username: /^[a-zA-Z0-9._]{1,30}$/.test(name) ? name : 'บัญชีของฉัน',
                followerCount: ufFollowers.length,
                followingCount: ufFollowing.length
            };
            ufScanIncomplete = false;
            ufResultSection.style.display = 'block';
            ufProfileCard.style.display = 'none';
            ufProgressCard.style.display = 'none';
            ufErrorCard.style.display = 'none';
            renderUnfollowersResults();
        } catch (error) {
            errorEl.textContent = error instanceof SyntaxError
                ? 'อ่านไฟล์ JSON ไม่ได้ กรุณาเลือกไฟล์ที่แตกจาก ZIP ของ Instagram'
                : error.message;
            errorEl.style.display = 'block';
        } finally {
            submitButton.disabled = false;
        }
    });
}

// ─── Recent Followers Tracker ───
// Snapshots stay in the browser's IndexedDB. The site never receives Instagram cookies.
const recentFollowersForm = document.getElementById('recent-followers-form');
const recentFollowersInput = document.getElementById('recent-followers-input');
const recentFollowersBookmarklet = document.getElementById('recent-followers-bookmarklet');
const recentFollowersDragButton = document.getElementById('recent-followers-drag-btn');
const recentFollowersError = document.getElementById('recent-followers-error');
const recentFollowersResults = document.getElementById('recent-followers-results');
const recentFollowersGrid = document.getElementById('rf-users-grid');
const recentFollowersEmpty = document.getElementById('rf-list-empty');
const recentFollowersDescription = document.getElementById('rf-list-description');
const recentFollowersNewButton = document.getElementById('rf-show-new');
const recentFollowersCurrentButton = document.getElementById('rf-show-current');
const recentFollowersClearButton = document.getElementById('rf-clear-snapshot');

let recentFollowersSnapshot = null;
let recentFollowersPreviousSnapshot = null;
let recentFollowersNewUsers = [];
let recentFollowersView = 'new';

function normalizeInstagramUsername(value) {
    const username = extractUsername(value).trim().replace(/^@/, '').toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(username) ? username : '';
}

function openRecentFollowersDatabase() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('เบราว์เซอร์นี้ไม่รองรับการเก็บ snapshot'));
            return;
        }
        const request = window.indexedDB.open('storiesig-recent-followers', 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('snapshots')) {
                request.result.createObjectStore('snapshots', { keyPath: 'username' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('ไม่สามารถเปิดฐานข้อมูลในเบราว์เซอร์'));
    });
}

async function recentFollowersDbRequest(mode, username, value) {
    const database = await openRecentFollowersDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('snapshots', mode === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('snapshots');
        const request = mode === 'get'
            ? store.get(username)
            : mode === 'delete'
                ? store.delete(username)
                : store.put(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('ไม่สามารถบันทึก snapshot'));
        transaction.onabort = () => reject(transaction.error || new Error('ไม่สามารถบันทึก snapshot'));
        transaction.oncomplete = () => database.close();
    });
}

function makeUniqueRecentFollowers(users) {
    const seen = new Set();
    return (users || []).reduce((result, user) => {
        const username = normalizeInstagramUsername(user?.username || '');
        if (username && !seen.has(username)) {
            seen.add(username);
            result.push({
                username,
                fullName: typeof user.fullName === 'string' ? user.fullName : '',
                avatar: typeof user.avatar === 'string' ? user.avatar : ''
            });
        }
        return result;
    }, []);
}

function formatRecentFollowerTime(timestamp) {
    return new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(timestamp));
}

function formatRecentFollowerChange(change) {
    if (change > 0) return `เพิ่ม ${change.toLocaleString()} จากครั้งก่อน`;
    if (change < 0) return `ลด ${Math.abs(change).toLocaleString()} จากครั้งก่อน`;
    return 'ยอดเท่าเดิมจากครั้งก่อน';
}

function createRecentFollowerCard(user) {
    const card = document.createElement('div');
    card.className = 'uf-user-item';

    const info = document.createElement('div');
    info.className = 'uf-profile-info';
    const image = document.createElement('img');
    image.className = 'uf-user-avatar';
    image.alt = '';
    image.src = user.avatar || 'https://via.placeholder.com/150';
    image.onerror = () => { image.src = 'https://via.placeholder.com/150'; };
    const meta = document.createElement('div');
    meta.className = 'uf-user-meta';
    const username = document.createElement('h4');
    username.className = 'uf-user-username';
    username.textContent = `@${user.username}`;
    const fullName = document.createElement('p');
    fullName.className = 'uf-user-fullname';
    fullName.textContent = user.fullName || user.username;
    meta.append(username, fullName);
    info.append(image, meta);

    const actions = document.createElement('div');
    actions.className = 'uf-user-actions';
    const link = document.createElement('a');
    link.className = 'btn-action-sm btn-uf-ig';
    link.textContent = 'เปิด IG';
    link.href = `https://instagram.com/${encodeURIComponent(user.username)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    actions.appendChild(link);
    card.append(info, actions);
    return card;
}

function renderRecentFollowers() {
    if (!recentFollowersSnapshot) return;
    const { target, followers, followerCount, capturedAt, complete } = recentFollowersSnapshot;
    const previous = recentFollowersPreviousSnapshot;
    const currentUsers = followers || [];
    const displayUsers = recentFollowersView === 'new' ? recentFollowersNewUsers : currentUsers;
    const countChange = previous ? followerCount - previous.followerCount : null;

    document.getElementById('rf-target-username').textContent = `@${target.username}`;
    document.getElementById('rf-scan-time').textContent = `ตรวจเมื่อ ${formatRecentFollowerTime(capturedAt)}`;
    document.getElementById('rf-follower-count').textContent = Number(followerCount).toLocaleString();
    document.getElementById('rf-follower-change').textContent = previous
        ? formatRecentFollowerChange(countChange)
        : 'นี่คือ snapshot ครั้งแรก';
    document.getElementById('rf-new-count').textContent = previous ? recentFollowersNewUsers.length.toLocaleString() : '—';
    document.getElementById('rf-scan-status').textContent = complete
        ? previous ? 'บันทึก snapshot ล่าสุดแล้ว' : 'บันทึกจุดเริ่มต้นแล้ว'
        : 'ดึงรายชื่อไม่ครบ จึงไม่บันทึก snapshot';

    recentFollowersNewButton.classList.toggle('active', recentFollowersView === 'new');
    recentFollowersCurrentButton.classList.toggle('active', recentFollowersView === 'current');
    recentFollowersDescription.textContent = recentFollowersView === 'new'
        ? previous
            ? 'รายชื่อด้านล่างคือผู้ติดตามที่มีในรอบนี้ แต่ไม่มีใน snapshot ก่อนหน้า'
            : 'ต้องตรวจครั้งถัดไปเพื่อเปรียบเทียบและพบผู้ติดตามใหม่'
        : 'รายชื่อที่ Instagram ส่งกลับมาในการตรวจรอบล่าสุด ลำดับนี้ไม่ใช่การยืนยันเวลาที่กดฟอล';

    recentFollowersGrid.replaceChildren(...displayUsers.map(createRecentFollowerCard));
    recentFollowersEmpty.textContent = recentFollowersView === 'new'
        ? previous ? 'ไม่พบผู้ติดตามใหม่จากการเปรียบเทียบครั้งนี้' : 'ยังไม่มีข้อมูลก่อนหน้าให้เปรียบเทียบ'
        : 'Instagram ไม่ส่งรายชื่อผู้ติดตามกลับมา';
    recentFollowersEmpty.style.display = displayUsers.length ? 'none' : 'block';
    recentFollowersResults.style.display = 'block';
}

async function handleRecentFollowersPayload(data) {
    if (!data || data.source !== 'recent_followers_bookmarklet') return false;
    const username = normalizeInstagramUsername(data.target?.username || '');
    const users = makeUniqueRecentFollowers(data.followers);
    if (!username || !Array.isArray(data.followers)) return false;

    const followerCount = Number.isFinite(Number(data.target?.followerCount))
        ? Number(data.target.followerCount)
        : users.length;
    recentFollowersSnapshot = {
        username,
        target: {
            username,
            fullName: typeof data.target.fullName === 'string' ? data.target.fullName : username,
            isPrivate: Boolean(data.target.isPrivate)
        },
        followerCount,
        followers: users,
        capturedAt: Number(data.ts) || Date.now(),
        complete: data.complete === true
    };
    recentFollowersView = 'new';

    try {
        recentFollowersPreviousSnapshot = await recentFollowersDbRequest('get', username);
        const previousUsernames = new Set((recentFollowersPreviousSnapshot?.followers || [])
            .map(user => user.username.toLowerCase()));
        recentFollowersNewUsers = recentFollowersPreviousSnapshot
            ? users.filter(user => !previousUsernames.has(user.username))
            : [];

        if (recentFollowersSnapshot.complete) {
            await recentFollowersDbRequest('put', username, recentFollowersSnapshot);
        }
        if (window.location.hash !== '#/recent-followers') {
            window.location.hash = '#/recent-followers';
        }
        renderRecentFollowers();
        return true;
    } catch (error) {
        console.error('[Recent Followers] Snapshot error:', error);
        recentFollowersError.textContent = `แสดงผลได้ แต่บันทึก snapshot ไม่สำเร็จ: ${error.message}`;
        recentFollowersError.style.display = 'block';
        if (window.location.hash !== '#/recent-followers') window.location.hash = '#/recent-followers';
        renderRecentFollowers();
        return true;
    }
}

if (recentFollowersForm) {
    recentFollowersForm.addEventListener('submit', event => {
        event.preventDefault();
        const username = normalizeInstagramUsername(recentFollowersInput.value);
        if (!username) {
            recentFollowersError.textContent = 'กรุณาใส่ชื่อผู้ใช้ Instagram ที่ถูกต้อง';
            recentFollowersError.style.display = 'block';
            recentFollowersBookmarklet.style.display = 'none';
            return;
        }
        recentFollowersInput.value = username;
        recentFollowersError.style.display = 'none';
        document.getElementById('recent-followers-target-label').textContent = `@${username}`;
        recentFollowersDragButton.href = `javascript:${encodeURIComponent(generateRecentFollowersBookmarklet(username))}`;
        recentFollowersBookmarklet.style.display = 'block';
    });
}

if (recentFollowersDragButton) {
    recentFollowersDragButton.addEventListener('click', event => {
        event.preventDefault();
        alert('ลากปุ่มนี้ไปวางบน Bookmarks Bar แล้วไปกดปุ่มจากหน้า instagram.com');
    });
}

if (recentFollowersNewButton) {
    recentFollowersNewButton.addEventListener('click', () => {
        recentFollowersView = 'new';
        renderRecentFollowers();
    });
    recentFollowersCurrentButton.addEventListener('click', () => {
        recentFollowersView = 'current';
        renderRecentFollowers();
    });
    recentFollowersClearButton.addEventListener('click', async () => {
        if (!recentFollowersSnapshot) return;
        try {
            await recentFollowersDbRequest('delete', recentFollowersSnapshot.username);
            recentFollowersPreviousSnapshot = null;
            recentFollowersSnapshot = null;
            recentFollowersNewUsers = [];
            recentFollowersResults.style.display = 'none';
        } catch (error) {
            recentFollowersError.textContent = `ล้าง snapshot ไม่สำเร็จ: ${error.message}`;
            recentFollowersError.style.display = 'block';
        }
    });
}

// ─── Bookmarklet Code Generator ───
// This generates the JavaScript that runs ON instagram.com in the user's browser.
// It fetches followers/following using the user's own Instagram session.

function generateBookmarkletCode(isUltraSafe = true) {
    // Dynamically detect the current site URL for redirect
    const returnUrl = window.location.origin + window.location.pathname + '#/unfollowers';
    const returnOrigin = window.location.origin;
    
    // Safety config parameters based on mode
    const cntValExpr = isUltraSafe 
        ? '24' // exactly matches official web client scroll size
        : '(Math.floor(Math.random()*20)+30)'; // 30-50
        
    const delayExpr = isUltraSafe
        ? '(3500+Math.random()*3500)' // 3.5 to 7 seconds delay
        : '(1800+Math.random()*1700)'; // 1.8 to 3.5 seconds delay
        
    const restBreakCheck = isUltraSafe
        ? 'reqCount%4===0' // break every 4 requests
        : 'reqCount%5===0'; // break every 5 requests
        
    const restSecExpr = isUltraSafe
        ? '(Math.floor(Math.random()*6)+12)' // 12-18 seconds break
        : '(Math.floor(Math.random()*4)+5)'; // 5-8 seconds break
        
    // The bookmarklet script - runs ON instagram.com in the user's browser
    const code = `(function(){`
    + `if(location.hostname!=='instagram.com'&&location.hostname!=='www.instagram.com'){alert('Please open this on instagram.com first!');return;}`
    + `var overlay=document.createElement('div');`
    + `overlay.id='_bk_overlay';`
    + `overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#fff;';`
    + `overlay.innerHTML='<div style="text-align:center;max-width:420px;padding:24px;background:#1a1a1a;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid #333;"><h2 style="margin:0 0 8px;font-size:1.3rem;">Scanning IG Followers...</h2><p id=_bk_s style="margin:0 0 16px;color:#ccc;font-size:0.9rem;">Initializing...</p><div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin-bottom:12px;"><div id=_bk_b style="width:0%;height:100%;background:linear-gradient(90deg,#f09433,#dc2743,#bc1888);border-radius:4px;transition:width 0.3s;"></div></div><p id=_bk_c style="margin:0 0 16px;color:#888;font-size:0.8rem;">0/0</p><div id=_bk_btn_container></div></div>';`
    + `document.body.appendChild(overlay);`
    + `var st=document.getElementById('_bk_s'),bar=document.getElementById('_bk_b'),cnt=document.getElementById('_bk_c'),btnCont=document.getElementById('_bk_btn_container');`
    + `var csM=document.cookie.match(/csrftoken=([^;]+)/),csrf=csM?csM[1]:'',appId='936619743392459';`
    + `var H={'x-csrftoken':csrf,'x-ig-app-id':appId,'x-requested-with':'XMLHttpRequest','Accept':'*/*','x-asbd-id':'129477','x-ig-www-claim':'0'};`
    + `var stopped=false,followersData=[],followingData=[],userInfo=null,reqCount=0;`
    + `function dly(ms){return new Promise(function(r){setTimeout(r,ms);});}`
    + `function gC(n){var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]+)'));return m?m[1]:null;}`
    + `function simAct(){`
    + `try{`
    + `window.scrollBy(0,Math.random()>0.5?15:-15);`
    + `var e=new MouseEvent('mousemove',{clientX:Math.random()*window.innerWidth,clientY:Math.random()*window.innerHeight,bubbles:true});`
    + `document.dispatchEvent(e);`
    + `}catch(err){}`
    + `}`
    + `async function humDly(ms){`
    + `var start=Date.now();`
    + `while(Date.now()-start<ms){`
    + `if(stopped)break;`
    + `simAct();`
    + `await dly(250+Math.random()*250);`
    + `}`
    + `}`
    
    // Add Stop button
    + `var stopBtn=document.createElement('button');`
    + `stopBtn.textContent='หยุดและดูผลลัพธ์';`
    + `stopBtn.style.cssText='padding:8px 20px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;font-size:0.9rem;transition:background 0.2s;';`
    + `stopBtn.onmouseover=function(){stopBtn.style.background='rgba(255,255,255,0.25)';};`
    + `stopBtn.onmouseout=function(){stopBtn.style.background='rgba(255,255,255,0.15)';};`
    + `stopBtn.onclick=function(){stopped=true;};`
    + `btnCont.appendChild(stopBtn);`
    
    // getMyInfo: Instagram's profile endpoints can fail independently of the login session.
    // A readable ds_user_id still lets us fetch the lists when profile metadata is unavailable.
    + `async function gMI(){`
    + `var uid=gC('ds_user_id');`
    + `if(uid){`
    + `st.textContent='Found user ID: '+uid+', loading profile...';`
    + `try{var r=await fetch('/api/v1/users/'+uid+'/info/',{headers:H,credentials:'include'});`
    + `if(r.ok){var d=await r.json();if(d&&d.user)return d.user;}}catch(e){}`
    + `}`
    + `st.textContent='Trying alternative method...';`
    + `var paths=['/api/v1/accounts/current_user/?edit=true','/api/v1/accounts/current_user/'];`
    + `for(var i=0;i<paths.length;i++){`
    + `try{var r2=await fetch(paths[i],{headers:H,credentials:'include'});`
    + `if(r2.ok){var d2=await r2.json(),u=d2&&d2.user;if(u&&(u.pk||u.id))return u;}}catch(e){}`
    + `}`
    + `if(uid)return{pk:uid,id:uid,username:'id-'+uid};`
    + `throw new Error('ไม่สามารถระบุบัญชี Instagram ได้ กรุณาเปิด instagram.com ตรวจสอบว่าล็อกอินอยู่ แล้วลองอีกครั้ง หรือใช้ไฟล์ข้อมูลที่ดาวน์โหลดจาก Instagram');`
    + `}`
    
    // fetchList: paginated followers/following fetcher
    + `async function fL(uid,type,total){`
    + `var list=[],mxId='',more=true;`
    + `while(more && !stopped){`
    + `var cntVal=${cntValExpr};`
    + `var u='/api/v1/friendships/'+uid+'/'+type+'/?count='+cntVal;`
    + `if(mxId)u+='&max_id='+encodeURIComponent(mxId);`
    + `var r=await fetch(u,{headers:H,credentials:'include'});`
    + `if(r.status===401||r.status===403)throw new Error('Instagram ไม่อนุญาตให้ดึงรายชื่อในเซสชันนี้ กรุณายืนยันตัวตนใน Instagram หรือนำเข้าไฟล์ข้อมูลแทน');`
    + `if(!r.ok)throw new Error(type+' fetch failed: '+r.status);`
    + `var d=await r.json();`
    + `if(d.users)list=list.concat(d.users.map(function(x){return{username:x.username,fullName:x.full_name||'',avatar:''};}));`
    + `mxId=d.next_max_id||'';more=!!mxId;`
    + `var p=total>0?Math.min(100,Math.round(list.length/total*100)):0;`
    + `bar.style.width=p+'%';cnt.textContent=list.length+'/'+(total||'?');`
    + `st.textContent='Fetching '+type+'... '+list.length+' loaded';`
    + `if(more && !stopped){`
    + `reqCount++;`
    // Take a long break
    + `if(${restBreakCheck}){`
    + `var restSec=${restSecExpr};`
    + `for(var i=restSec;i>0;i--){`
    + `if(stopped)break;`
    + `st.textContent='หลบเลี่ยงบอท: พักสายตา '+i+' วินาที...';`
    + `await humDly(1000);`
    + `}`
    + `}else{`
    + `await humDly(${delayExpr});`
    + `}`
    + `}`
    + `}return list;}`
    
    // finishScan: prepares the UI for redirecting and registers communication listener
    + `function finishScan(){`
    + `var un=userInfo?userInfo.username:'unknown',fn=userInfo?(userInfo.full_name||un):un,fc=userInfo?userInfo.follower_count:0,gc=userInfo?userInfo.following_count:0;`
    + `st.textContent=stopped?'หยุดสแกนแล้ว (ได้ข้อมูลบางส่วน)':'สแกนเสร็จสิ้นแล้ว!';`
    + `bar.style.width='100%';`
    + `bar.style.background=stopped?'#f09433':'#2ecc71';`
    + `cnt.textContent='ผู้ติดตาม: '+followersData.length+', กำลังติดตาม: '+followingData.length;`
    + `btnCont.innerHTML='';`
    + `var goBtn=document.createElement('button');`
    + `goBtn.textContent='คลิกเพื่อดูผลวิเคราะห์';`
    + `goBtn.style.cssText='padding:10px 24px;background:#2ecc71;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:bold;box-shadow:0 4px 12px rgba(46,204,113,0.3);';`
    + `goBtn.onclick=function(){`
    + `var payload={source:'bookmarklet',username:un,fullName:fn,followerCount:fc,followingCount:gc,followers:followersData,following:followingData,ts:Date.now()};`
    + `var targetOrigin=${JSON.stringify(returnOrigin)},w;`
    + `var msgListener=function(event){`
    + `if(event.source===w&&event.origin===targetOrigin&&event.data&&event.data.type==='storiesig_ready'){`
    + `w.postMessage({source:'storiesig_bookmarklet',payload:payload},targetOrigin);`
    + `window.removeEventListener('message',msgListener);`
    + `overlay.remove();`
    + `}`
    + `};`
    + `window.addEventListener('message',msgListener);`
    + `w=window.open(${JSON.stringify(returnUrl)},'_blank');`
    + `if(!w){window.removeEventListener('message',msgListener);st.textContent='เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง';}`
    + `};`
    + `btnCont.appendChild(goBtn);`
    + `}`
    
    // Main execution
    + `(async function(){try{`
    + `st.textContent='Getting your account info...';`
    + `userInfo=await gMI();`
    + `var pk=userInfo.pk||userInfo.id,un=userInfo.username||'unknown',fn=userInfo.full_name||un,fc=userInfo.follower_count||0,gc=userInfo.following_count||0;`
    + `st.textContent='Found: @'+un+' (Followers: '+fc+', Following: '+gc+')';`
    + `await dly(1000);`
    + `if(stopped){finishScan();return;}`
    + `st.textContent='Fetching followers...';bar.style.width='0%';`
    + `followersData=await fL(pk,'followers',fc);`
    + `if(stopped){finishScan();return;}`
    + `st.textContent='Followers done ('+followersData.length+'). Pausing...';bar.style.width='100%';`
    + `await dly(2000);bar.style.width='0%';`
    + `if(stopped){finishScan();return;}`
    + `st.textContent='Fetching following...';`
    + `followingData=await fL(pk,'following',gc);`
    + `finishScan();`
    + `}catch(e){`
    + `st.textContent='Error: '+e.message;`
    + `bar.style.background='#e74c3c';bar.style.width='100%';cnt.textContent='Failed';`
    + `btnCont.innerHTML='';`
    + `var b=document.createElement('button');b.textContent='Close';`
    + `b.style.cssText='padding:8px 24px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;';`
    + `b.onclick=function(){overlay.remove();};btnCont.appendChild(b);`
    + `}})();`
    + `})();`;
    
    return code;
}

function generateRecentFollowersBookmarklet(targetUsername) {
    const returnUrl = `${window.location.origin}${window.location.pathname}#/recent-followers`;
    const returnOrigin = window.location.origin;
    const safeTarget = JSON.stringify(targetUsername);
    const safeReturnUrl = JSON.stringify(returnUrl);
    const safeReturnOrigin = JSON.stringify(returnOrigin);

    return `(function(){`
    + `if(location.hostname!=='instagram.com'&&location.hostname!=='www.instagram.com'){alert('Please open this on instagram.com first!');return;}`
    + `var target=${safeTarget},overlay=document.createElement('div');`
    + `overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#fff';`
    + `overlay.innerHTML='<div style="width:min(420px,calc(100% - 40px));padding:24px;background:#1a1a1a;border:1px solid #333;border-radius:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.5)"><h2 style="margin:0 0 8px;font-size:1.25rem">Checking followers</h2><p id="_rf_status" style="margin:0 0 16px;color:#ccc;font-size:.9rem">Preparing @'+target+'...</p><div style="height:6px;background:#333;border-radius:4px;overflow:hidden;margin-bottom:12px"><div id="_rf_bar" style="width:0;height:100%;background:linear-gradient(90deg,#f09433,#dc2743,#bc1888);transition:width .3s"></div></div><p id="_rf_count" style="margin:0 0 16px;color:#999;font-size:.8rem">0</p><div id="_rf_actions"></div></div>';`
    + `document.body.appendChild(overlay);`
    + `var status=document.getElementById('_rf_status'),bar=document.getElementById('_rf_bar'),count=document.getElementById('_rf_count'),actions=document.getElementById('_rf_actions'),stopped=false,users=[],targetUser=null;`
    + `var csrf=(document.cookie.match(/(?:^|;\\s*)csrftoken=([^;]+)/)||[])[1]||'',headers={'x-csrftoken':csrf,'x-ig-app-id':'936619743392459','x-requested-with':'XMLHttpRequest','Accept':'*/*'};`
    + `function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}`
    + `function closeButton(){var b=document.createElement('button');b.textContent='ปิด';b.style.cssText='padding:8px 22px;border:0;border-radius:8px;background:#e74c3c;color:#fff;cursor:pointer;font-weight:600';b.onclick=function(){overlay.remove()};actions.appendChild(b);}`
    + `function stopButton(){var b=document.createElement('button');b.textContent='หยุด (ไม่บันทึก snapshot)';b.style.cssText='padding:8px 16px;border:1px solid #666;border-radius:8px;background:transparent;color:#fff;cursor:pointer';b.onclick=function(){stopped=true;b.disabled=true;b.textContent='กำลังหยุด...'};actions.appendChild(b);}`
    + `async function request(path){return fetch(path,{headers:headers,credentials:'include'});}`
    + `async function findTarget(){`
    + `var response=await request('/api/v1/users/web_profile_info/?username='+encodeURIComponent(target));`
    + `if(response.ok){var profile=await response.json(),profileUser=profile&&profile.data&&profile.data.user;if(profileUser&&(profileUser.pk||profileUser.id))return profileUser;}`
    + `var searchResponse=await request('/web/search/topsearch/?context=blended&query='+encodeURIComponent(target));`
    + `if(!searchResponse.ok)throw new Error('ไม่พบหรือเข้าถึงบัญชี @'+target+' ไม่ได้');`
    + `var search=await searchResponse.json(),matches=(search&&search.users)||[],match=matches.find(function(item){return item.user&&String(item.user.username).toLowerCase()===target});`
    + `if(!match||!match.user)throw new Error('ไม่พบบัญชี @'+target);`
    + `var user=match.user,id=user.pk||user.id;`
    + `try{var infoResponse=await request('/api/v1/users/'+id+'/info/');if(infoResponse.ok){var info=await infoResponse.json();if(info&&info.user)user=info.user;}}catch(error){}`
    + `return user;`
    + `}`
    + `async function fetchFollowers(userId,total){`
    + `var list=[],next='',more=true;`
    + `while(more&&!stopped){`
    + `var path='/api/v1/friendships/'+userId+'/followers/?count=24'+(next?'&max_id='+encodeURIComponent(next):'');`
    + `var response=await request(path);`
    + `if(response.status===401||response.status===403)throw new Error('Instagram ไม่อนุญาตให้ดูรายชื่อผู้ติดตามของบัญชีนี้ใน session ปัจจุบัน');`
    + `if(response.status===429)throw new Error('Instagram จำกัดคำขอชั่วคราว กรุณารอสักพักแล้วลองใหม่');`
    + `if(!response.ok)throw new Error('ดึงรายชื่อผู้ติดตามไม่สำเร็จ ('+response.status+')');`
    + `var page=await response.json(),pageUsers=Array.isArray(page.users)?page.users:[];`
    + `list=list.concat(pageUsers.map(function(user){return{username:user.username,fullName:user.full_name||'',avatar:user.profile_pic_url||''}}));`
    + `next=page.next_max_id||'';more=Boolean(next);`
    + `var percent=total>0?Math.min(100,Math.round(list.length/total*100)):0;bar.style.width=percent+'%';count.textContent=list.length+(total?' / '+total:'');status.textContent='กำลังดึงผู้ติดตาม @'+target+' ... '+list.length;`
    + `if(more&&!stopped)await delay(1500);`
    + `}`
    + `return list;`
    + `}`
    + `function sendResult(complete){`
    + `actions.replaceChildren();var button=document.createElement('button');button.textContent='ดูผลการเปรียบเทียบ';button.style.cssText='padding:10px 22px;border:0;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-weight:700';`
    + `button.onclick=function(){var payload={source:'recent_followers_bookmarklet',target:{username:targetUser.username||target,fullName:targetUser.full_name||targetUser.username||target,followerCount:Number(targetUser.follower_count)||users.length,isPrivate:Boolean(targetUser.is_private)},followers:users,complete:complete,ts:Date.now()};var popup,origin=${safeReturnOrigin};var listener=function(event){if(event.source===popup&&event.origin===origin&&event.data&&event.data.type==='storiesig_recent_followers_ready'){popup.postMessage({source:'storiesig_recent_followers',payload:payload},origin);window.removeEventListener('message',listener);overlay.remove();}};window.addEventListener('message',listener);popup=window.open(${safeReturnUrl},'_blank');if(!popup){window.removeEventListener('message',listener);status.textContent='เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองอีกครั้ง';}};actions.appendChild(button);`
    + `}`
    + `(async function(){try{stopButton();status.textContent='กำลังตรวจสอบสิทธิ์สำหรับ @'+target+'...';targetUser=await findTarget();var id=targetUser.pk||targetUser.id;if(!id)throw new Error('ไม่พบรหัสบัญชีของ @'+target);var total=Number(targetUser.follower_count)||0;status.textContent='พบ @'+(targetUser.username||target)+' กำลังเริ่มดึงรายชื่อ...';users=await fetchFollowers(id,total);var complete=!stopped&&(!total||users.length>=total);bar.style.width='100%';bar.style.background=complete?'#2ecc71':'#f09433';count.textContent='ดึงได้ '+users.length+' รายชื่อ';status.textContent=complete?'ดึงรายชื่อครบแล้ว':stopped?'หยุดก่อนครบ จะแสดงได้แต่ไม่บันทึก snapshot':'รายชื่อไม่ครบตามยอดผู้ติดตาม จึงไม่บันทึก snapshot';sendResult(complete);}catch(error){status.textContent='เกิดข้อผิดพลาด: '+error.message;bar.style.width='100%';bar.style.background='#e74c3c';actions.replaceChildren();closeButton();}})();`
    + `})();`;
}


// ─── Initialize Bookmarklet UI ───
function initBookmarkletUI() {
    const chkUltraSafe = document.getElementById('chk-ultra-safe');
    
    const updateBookmarklet = () => {
        const isUltraSafe = chkUltraSafe ? chkUltraSafe.checked : true;
        const bookmarkletCode = generateBookmarkletCode(isUltraSafe);
        
        // Set drag button href
        const dragBtn = document.getElementById('bookmarklet-drag-btn');
        if (dragBtn) {
            dragBtn.href = 'javascript:' + encodeURIComponent(bookmarkletCode);
        }
    };
    
    // Run initially
    updateBookmarklet();
    
    // Listen for changes
    if (chkUltraSafe) {
        chkUltraSafe.addEventListener('change', updateBookmarklet);
    }
    
    // Set drag button events
    const dragBtn = document.getElementById('bookmarklet-drag-btn');
    if (dragBtn) {
        // Prevent click from executing it on our page
        dragBtn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('ลากปุ่มนี้ไปวางบน Bookmarks Bar ของเบราว์เซอร์ อย่ากดคลิก!');
            return false;
        });
    }
}

// ─── Handle Received Payload ───
function handleBookmarkletPayload(data) {
    try {
        if (!data || data.source !== 'bookmarklet') return false;
        
        console.log('[Bookmarklet] Received data from Instagram payload:', data.username, 
            'Followers:', data.followers?.length, 'Following:', data.following?.length);

        // Ensure we're on the unfollowers view
        if (window.location.hash !== '#/unfollowers') {
            window.location.hash = '#/unfollowers';
        }
        
        // Show the bookmarklet status card briefly
        const statusCard = document.getElementById('bookmarklet-status-card');
        const statusTitle = document.getElementById('bookmarklet-status-title');
        const statusDesc = document.getElementById('bookmarklet-status-desc');
        const guideBox = document.querySelector('.bookmarklet-guide-box');

        if (guideBox) guideBox.style.display = 'none';
        if (statusCard) {
            statusCard.style.display = 'block';
            if (statusTitle) statusTitle.textContent = `กำลังประมวลผลข้อมูลของ @${data.username}...`;
            if (statusDesc) statusDesc.textContent = `ผู้ติดตาม ${data.followers?.length || 0} คน, กำลังติดตาม ${data.following?.length || 0} คน`;
        }
        
        // Populate the unfollowers data into the existing pipeline
        ufTargetUser = {
            pk: 0,
            username: data.username,
            fullName: data.fullName || data.username,
            avatar: '',
            isPrivate: false,
            followerCount: data.followerCount || data.followers?.length || 0,
            followingCount: data.followingCount || data.following?.length || 0
        };
        
        ufFollowers = (data.followers || []).map(f => ({
            username: f.username,
            fullName: f.fullName || f.full_name || '',
            avatar: f.avatar || ''
        }));
        
        ufFollowing = (data.following || []).map(f => ({
            username: f.username,
            fullName: f.fullName || f.full_name || '',
            avatar: f.avatar || ''
        }));
        
        ufScanIncomplete = false;
        
        // Small delay to show status, then render results
        setTimeout(() => {
            if (statusCard) statusCard.style.display = 'none';
            
            // Show the results section
            if (ufResultSection) ufResultSection.style.display = 'block';
            
            // Render results using existing function
            renderUnfollowersResults();
        }, 1500);
        
        return true;
    } catch (e) {
        console.error('[Bookmarklet] Error processing payload:', e);
        return false;
    }
}

// ─── Check for Bookmarklet Return Data (Legacy / window.name fallback) ───
function checkBookmarkletData() {
    try {
        const raw = window.name;
        if (!raw || raw.length < 50) return false;
        
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return false;
        }
        
        if (!data || data.source !== 'bookmarklet') return false;
        
        // Clear window.name immediately to prevent re-processing on refresh
        window.name = '';
        
        return handleBookmarkletPayload(data);
    } catch (e) {
        console.error('[Bookmarklet] Error checking window.name:', e);
        return false;
    }
}

// Register postMessage listener for Bookmarklet
window.addEventListener('message', (event) => {
    if (event.source === window.opener &&
        (event.origin === 'https://www.instagram.com' || event.origin === 'https://instagram.com') &&
        event.data) {
        if (event.data.source === 'storiesig_bookmarklet') {
            handleBookmarkletPayload(event.data.payload);
        } else if (event.data.source === 'storiesig_recent_followers') {
            handleRecentFollowersPayload(event.data.payload);
        }
    }
});

// ─── Initialize on DOM Ready ───
window.addEventListener('DOMContentLoaded', () => {
    initBookmarkletUI();
    // Check for bookmarklet return data after a small delay
    // to let the routing settle first
    setTimeout(() => {
        checkBookmarkletData();
    }, 300);
});
