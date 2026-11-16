/**
 * StoriesIG Backend Server
 * ========================
 * Express server ทำหน้าที่เป็น Proxy ดึงข้อมูลจาก Instagram Web API
 * โดยใช้ Cookie จากบัญชี Bot IG ที่กำหนดไว้ในไฟล์ .env
 *
 * Endpoints:
 *   GET /api/profile?username=...        - ดึงข้อมูลโปรไฟล์ + โพสต์ล่าสุด
 *   GET /api/stories?userId=...          - ดึงสตอรี่ล่าสุด 24 ชม.
 *   GET /api/highlights?userId=...       - ดึงรายการไฮไลท์ (tray)
 *   GET /api/highlight-stories?highlightId=...  - ดึงสตอรี่ในไฮไลท์
 *   GET /api/media-proxy?url=...         - Proxy รูปภาพ/วิดีโอจาก Instagram CDN
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Proxy Agent if PROXY_URL is specified
const configProxyUrl = process.env.PROXY_URL;
let httpsAgent;
if (configProxyUrl) {
    try {
        console.log(`[Proxy] Configuring proxy agent for: ${configProxyUrl.replace(/:[^:@]+@/, ':****@')}`);
        httpsAgent = new HttpsProxyAgent(configProxyUrl, {
            timeout: process.env.VERCEL ? 4500 : 10000, // 10s connection timeout on Render/Local
            keepAlive: true
        });
    } catch (e) {
        console.error('[Proxy] Failed to initialize HttpsProxyAgent:', e.message);
    }
}

// Instagram Web API Configuration
const IG_WEB_BASE = 'https://www.instagram.com';  // For web_profile_info
const IG_MOBILE_BASE = 'https://i.instagram.com'; // For stories, highlights, reels
const IG_APP_ID = '936619743392459';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ─── Helper: Extract csrftoken from cookie string ───
function getCsrfToken() {
    const cookie = process.env.IG_COOKIE || '';
    const match = cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
}

// ─── Helper: Build headers for Instagram requests ───
function igHeaders() {
    return {
        'User-Agent': USER_AGENT,
        'X-IG-App-ID': IG_APP_ID,
        'X-IG-WWW-Claim': '0',
        'X-ASBD-ID': '129477',
        'X-CSRFToken': getCsrfToken(),
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
        'Cookie': process.env.IG_COOKIE || '',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
    };
}

// ─── Helper: Fetch from Instagram with retry + exponential backoff ───
async function igFetch(url, retries = process.env.VERCEL ? 1 : 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.get(url, {
                headers: igHeaders(),
                timeout: process.env.VERCEL ? 8000 : 20000, // 20s request timeout on Render/Local
                validateStatus: () => true, // Don't throw error on non-200 responses to handle 429 customly
                ...(httpsAgent ? { httpsAgent, httpAgent: httpsAgent } : {})
            });

            if (res.status === 429) {
                if (process.env.VERCEL) {
                    throw new Error('Instagram rate limit exceeded (429) on serverless environment.');
                }
                // Rate limited — wait and retry
                const waitMs = attempt * 2000;
                console.log(`[igFetch] 429 rate limit, retrying in ${waitMs}ms (attempt ${attempt}/${retries})`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            if (res.status !== 200) {
                const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data) || '';
                throw new Error(`Instagram API ${res.status}: ${text.substring(0, 300)}`);
            }

            if (res.data && res.data.status === 'fail') {
                const msg = res.data.message || JSON.stringify(res.data);
                throw new Error(`Instagram API failure: ${msg.substring(0, 300)}`);
            }

            return res.data;
        } catch (err) {
            if (attempt === retries) throw err;
            const waitMs = process.env.VERCEL ? 500 : attempt * 1500;
            console.log(`[igFetch] Error: ${err.message}, retrying in ${waitMs}ms (attempt ${attempt}/${retries})`);
            await new Promise(r => setTimeout(r, waitMs));
        }
    }
    throw new Error('Instagram rate limit exceeded (429) after all retry attempts.');
}

// ─── Helper: Format number for display ───
function formatNumber(num) {
    if (!num && num !== 0) return '0';
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
}

// ─── Helper: Time ago formatter ───
function timeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000) - timestamp;
    if (seconds < 60) return 'เมื่อสักครู่';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ชม. ที่แล้ว`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} วันที่แล้ว`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} สัปดาห์ที่แล้ว`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} เดือนที่แล้ว`;
    return `${Math.floor(days / 365)} ปีที่แล้ว`;
}

// ─── Helper: Proxy URL wrapper ───
function proxyUrl(originalUrl) {
    if (!originalUrl) return '';
    return `/api/media-proxy?url=${encodeURIComponent(originalUrl)}`;
}

// Helper: Extract username from raw input (supports profile/story URLs and @ prefixes)
function cleanUsername(input) {
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
            // ignore
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

// ════════════════════════════════════════════════════════════
// API ENDPOINT 1: Profile Info + Posts
// ════════════════════════════════════════════════════════════
app.get('/api/profile', async (req, res) => {
    try {
        let { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Missing username' });

        username = cleanUsername(username).toLowerCase();
        if (!username) return res.status(400).json({ error: 'Invalid username' });

        if (!process.env.IG_COOKIE) {
            return res.status(500).json({ error: 'IG_COOKIE not configured. Please set it in .env file.' });
        }

        let user;
        let posts = [];
        let useFallback = false;

        try {
            const data = await igFetch(
                `${IG_WEB_BASE}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
            );
            user = data?.data?.user;
            if (!user) {
                useFallback = true;
            }
        } catch (err) {
            console.warn(`[Profile] web_profile_info failed, trying fallback search + user feed. Error: ${err.message}`);
            useFallback = true;
        }

        if (useFallback) {
            // Fallback: search for username using topsearch to get ID and basic info
            const searchData = await igFetch(
                `${IG_WEB_BASE}/web/search/topsearch/?context=blended&query=${encodeURIComponent(username)}`
            );
            const match = searchData?.users?.find(
                u => u.user.username.toLowerCase() === username.toLowerCase()
            );
            if (!match) {
                return res.status(404).json({ error: 'User not found' });
            }

            const searchUser = match.user;
            const userId = searchUser.pk || searchUser.id;

            // 1. Fetch detailed user profile info (biography, follower_count, etc.) and page 1 of recent posts in parallel to avoid Vercel 10s timeout
            let u = {};
            let feedItems = [];
            let feedData1;

            const [infoRes, feedRes] = await Promise.allSettled([
                igFetch(`${IG_WEB_BASE}/api/v1/users/${userId}/info/`),
                igFetch(`${IG_MOBILE_BASE}/api/v1/feed/user/${userId}/`)
            ]);

            if (infoRes.status === 'fulfilled' && infoRes.value) {
                u = infoRes.value.user || {};
            } else {
                console.warn(`[Profile] Failed to fetch detailed info for ID ${userId}: ${infoRes.reason?.message}`);
            }

            if (feedRes.status === 'fulfilled' && feedRes.value) {
                feedData1 = feedRes.value;
                if (feedData1.items) {
                    feedItems.push(...feedData1.items);
                }
            } else {
                console.error(`[Profile] Failed to fetch page 1 of feed: ${feedRes.reason?.message}`);
            }

            // Parse feed items to posts format
            posts = feedItems.map(item => {
                const isCarousel = item.media_type === 8;
                const isVideo = item.media_type === 2;

                let slides = [];
                if (isCarousel && item.carousel_media) {
                    slides = item.carousel_media.map(slide => {
                        const slideIsVideo = slide.media_type === 2;
                        let slideUrl = '';
                        if (slideIsVideo && slide.video_versions?.length) {
                            slideUrl = slide.video_versions[0].url;
                        } else if (slide.image_versions2?.candidates?.length) {
                            slideUrl = slide.image_versions2.candidates[0].url;
                        }
                        return {
                            url: proxyUrl(slideUrl),
                            type: slideIsVideo ? 'video' : 'image',
                        };
                    });
                } else {
                    let mediaUrl = '';
                    if (isVideo && item.video_versions?.length) {
                        mediaUrl = item.video_versions[0].url;
                    } else if (item.image_versions2?.candidates?.length) {
                        mediaUrl = item.image_versions2.candidates[0].url;
                    }
                    slides = [{
                        url: proxyUrl(mediaUrl),
                        type: isVideo ? 'video' : 'image',
                    }];
                }

                return {
                    id: item.pk,
                    shortcode: item.code,
                    thumbnail: proxyUrl(item.image_versions2?.candidates?.[0]?.url || ''),
                    slides,
                    isVideo,
                    isCarousel,
                    caption: item.caption?.text || '',
                    likes: item.like_count || 0,
                    comments: item.comment_count || 0,
                    timestamp: item.taken_at,
                    timeAgo: timeAgo(item.taken_at),
                };
            });

            const nextMaxId = posts.length > 0 ? posts[posts.length - 1].id : null;

            return res.json({
                id: userId,
                username: u.username || searchUser.username,
                fullName: u.full_name || searchUser.full_name || searchUser.username,
                avatar: proxyUrl(u.profile_pic_url || searchUser.profile_pic_url),
                isVerified: u.is_verified ?? searchUser.is_verified,
                isPrivate: u.is_private ?? searchUser.is_private,
                bio: u.biography || '',
                externalUrl: u.external_url || '',
                postsCount: u.media_count !== undefined ? formatNumber(u.media_count) : '--',
                followersCount: u.follower_count !== undefined ? formatNumber(u.follower_count) : '--',
                followingCount: u.following_count !== undefined ? formatNumber(u.following_count) : '--',
                posts,
                nextMaxId,
                moreAvailable: feedData1?.more_available || false,
            });
        }

        if (user.is_private) {
            return res.status(403).json({ error: 'Private account', is_private: true });
        }

        // Extract posts from edge_owner_to_timeline_media
        const postsEdges = user.edge_owner_to_timeline_media?.edges || [];
        posts = postsEdges.map(edge => {
            const node = edge.node;
            const isCarousel = node.__typename === 'GraphSidecar';
            const isVideo = node.is_video;

            let slides = [];
            if (isCarousel && node.edge_sidecar_to_children?.edges) {
                slides = node.edge_sidecar_to_children.edges.map(child => ({
                    url: proxyUrl(child.node.is_video ? child.node.video_url : child.node.display_url),
                    type: child.node.is_video ? 'video' : 'image',
                }));
            } else {
                slides = [{
                    url: proxyUrl(isVideo ? (node.video_url || node.display_url) : node.display_url),
                    type: isVideo ? 'video' : 'image',
                }];
            }

            return {
                id: node.id,
                shortcode: node.shortcode,
                thumbnail: proxyUrl(node.thumbnail_src || node.display_url),
                slides,
                isVideo,
                isCarousel,
                caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                likes: node.edge_media_preview_like?.count || node.edge_liked_by?.count || 0,
                comments: node.edge_media_to_comment?.count || 0,
                timestamp: node.taken_at_timestamp,
                timeAgo: timeAgo(node.taken_at_timestamp),
            };
        });

        const nextMaxId = posts.length > 0 ? posts[posts.length - 1].id : null;
        const moreAvailable = user.edge_owner_to_timeline_media?.page_info?.has_next_page || false;

        res.json({
            id: user.id,
            username: user.username,
            fullName: user.full_name || user.username,
            avatar: proxyUrl(user.profile_pic_url_hd || user.profile_pic_url),
            isVerified: user.is_verified,
            isPrivate: user.is_private,
            bio: user.biography || '',
            externalUrl: user.external_url || '',
            postsCount: formatNumber(user.edge_owner_to_timeline_media?.count),
            followersCount: formatNumber(user.edge_followed_by?.count),
            followingCount: formatNumber(user.edge_follow?.count),
            posts,
            nextMaxId,
            moreAvailable,
        });
    } catch (err) {
        console.error('[/api/profile] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT 2: Stories (24h)
// ════════════════════════════════════════════════════════════
app.get('/api/stories', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        const data = await igFetch(
            `${IG_MOBILE_BASE}/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`
        );

        const reel = data?.reels?.[userId] || data?.reels_media?.[0];
        if (!reel || !reel.items || reel.items.length === 0) {
            return res.json({ stories: [] });
        }

        const stories = reel.items.map(item => {
            const isVideo = item.media_type === 2;
            let mediaUrl = '';

            if (isVideo && item.video_versions?.length) {
                mediaUrl = item.video_versions[0].url;
            } else if (item.image_versions2?.candidates?.length) {
                mediaUrl = item.image_versions2.candidates[0].url;
            }

            return {
                id: item.id,
                url: proxyUrl(mediaUrl),
                originalUrl: mediaUrl,
                type: isVideo ? 'video' : 'image',
                time: timeAgo(item.taken_at),
                timestamp: item.taken_at,
            };
        });

        res.json({ stories });
    } catch (err) {
        console.error('[/api/stories] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT 3: Highlights Tray (list of highlight groups)
// ════════════════════════════════════════════════════════════
app.get('/api/highlights', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        const data = await igFetch(
            `${IG_MOBILE_BASE}/api/v1/highlights/${encodeURIComponent(userId)}/highlights_tray/`
        );

        const tray = data?.tray || [];
        const highlights = tray.map(hl => {
            let coverUrl = '';
            if (hl.cover_media?.cropped_image_version?.url) {
                coverUrl = hl.cover_media.cropped_image_version.url;
            } else if (hl.cover_media?.media_id) {
                // Sometimes cover is nested differently
                coverUrl = hl.cover_media?.cropped_image_version?.url || '';
            }

            return {
                id: hl.id,
                title: hl.title || 'Untitled',
                cover: proxyUrl(coverUrl),
                storiesCount: hl.media_count || 0,
            };
        });

        res.json({ highlights });
    } catch (err) {
        console.error('[/api/highlights] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT 4: Highlight Stories (stories inside a highlight)
// ════════════════════════════════════════════════════════════
app.get('/api/highlight-stories', async (req, res) => {
    try {
        const { highlightId } = req.query;
        if (!highlightId) return res.status(400).json({ error: 'Missing highlightId' });

        const data = await igFetch(
            `${IG_MOBILE_BASE}/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(highlightId)}`
        );

        // Highlight IDs look like "highlight:1234567890"
        const reel = data?.reels?.[highlightId] || Object.values(data?.reels || {})[0];
        if (!reel || !reel.items) {
            return res.json({ stories: [] });
        }

        const stories = reel.items.map(item => {
            const isVideo = item.media_type === 2;
            let mediaUrl = '';

            if (isVideo && item.video_versions?.length) {
                mediaUrl = item.video_versions[0].url;
            } else if (item.image_versions2?.candidates?.length) {
                mediaUrl = item.image_versions2.candidates[0].url;
            }

            return {
                id: item.id,
                url: proxyUrl(mediaUrl),
                originalUrl: mediaUrl,
                type: isVideo ? 'video' : 'image',
                time: 'ไฮไลท์',
                timestamp: item.taken_at,
            };
        });

        res.json({ stories });
    } catch (err) {
        console.error('[/api/highlight-stories] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT: Paginated Posts
// ════════════════════════════════════════════════════════════
app.get('/api/posts', async (req, res) => {
    try {
        const { userId, maxId } = req.query;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });

        let queryMaxId = '';
        if (maxId) {
            queryMaxId = maxId.includes('_') ? maxId : `${maxId}_${userId}`;
        }

        const url = queryMaxId
            ? `${IG_MOBILE_BASE}/api/v1/feed/user/${userId}/?max_id=${encodeURIComponent(queryMaxId)}`
            : `${IG_MOBILE_BASE}/api/v1/feed/user/${userId}/`;

        const feedData = await igFetch(url);

        const posts = (feedData?.items || []).map(item => {
            const isCarousel = item.media_type === 8;
            const isVideo = item.media_type === 2;

            let slides = [];
            if (isCarousel && item.carousel_media) {
                slides = item.carousel_media.map(slide => {
                    const slideIsVideo = slide.media_type === 2;
                    let slideUrl = '';
                    if (slideIsVideo && slide.video_versions?.length) {
                        slideUrl = slide.video_versions[0].url;
                    } else if (slide.image_versions2?.candidates?.length) {
                        slideUrl = slide.image_versions2.candidates[0].url;
                    }
                    return {
                        url: proxyUrl(slideUrl),
                        type: slideIsVideo ? 'video' : 'image',
                    };
                });
            } else {
                let mediaUrl = '';
                if (isVideo && item.video_versions?.length) {
                    mediaUrl = item.video_versions[0].url;
                } else if (item.image_versions2?.candidates?.length) {
                    mediaUrl = item.image_versions2.candidates[0].url;
                }
                slides = [{
                    url: proxyUrl(mediaUrl),
                    type: isVideo ? 'video' : 'image',
                }];
            }

            return {
                id: item.pk,
                shortcode: item.code,
                thumbnail: proxyUrl(item.image_versions2?.candidates?.[0]?.url || ''),
                slides,
                isVideo,
                isCarousel,
                caption: item.caption?.text || '',
                likes: item.like_count || 0,
                comments: item.comment_count || 0,
                timestamp: item.taken_at,
                timeAgo: timeAgo(item.taken_at),
            };
        });

        const nextMaxId = posts.length > 0 ? posts[posts.length - 1].id : null;

        res.json({
            posts,
            nextMaxId,
            moreAvailable: feedData?.more_available || false,
        });
    } catch (err) {
        console.error('[/api/posts] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT 4.5: Search User
// ════════════════════════════════════════════════════════════
app.get('/api/search-user', async (req, res) => {
    try {
        let { username } = req.query;
        if (!username) return res.status(400).json({ error: 'Missing username parameter' });

        username = cleanUsername(username).toLowerCase();
        if (!username) return res.status(400).json({ error: 'Invalid username' });

        if (!process.env.IG_COOKIE) {
            return res.status(500).json({ error: 'IG_COOKIE not configured.' });
        }

        // Use topsearch to find user
        const searchData = await igFetch(
            `${IG_WEB_BASE}/web/search/topsearch/?context=blended&query=${encodeURIComponent(username)}`
        );
        const match = searchData?.users?.find(
            u => u.user.username.toLowerCase() === username.toLowerCase()
        );

        if (!match) {
            return res.status(404).json({ error: 'User not found' });
        }

        const searchUser = match.user;
        const userId = searchUser.pk || searchUser.id;

        // Fetch detailed user info to get counts
        let followerCount = 0;
        let followingCount = 0;
        try {
            const infoRes = await igFetch(`${IG_WEB_BASE}/api/v1/users/${userId}/info/`);
            if (infoRes?.user) {
                followerCount = infoRes.user.follower_count || 0;
                followingCount = infoRes.user.following_count || 0;
            }
        } catch (e) {
            console.warn('[search-user] Failed to fetch detailed user info:', e.message);
        }

        res.json({
            pk: userId,
            username: searchUser.username,
            fullName: searchUser.full_name,
            avatar: proxyUrl(searchUser.profile_pic_url || searchUser.profile_pic_url_hd),
            isPrivate: searchUser.is_private || false,
            followerCount,
            followingCount
        });
    } catch (err) {
        console.error('[/api/search-user] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT 4.6: Fetch Friendships (Followers / Following)
// ════════════════════════════════════════════════════════════
app.get('/api/friendships', async (req, res) => {
    try {
        const { userId, list, maxId, rankToken } = req.query;
        if (!userId || !list) {
            return res.status(400).json({ error: 'Missing userId or list parameter' });
        }
        if (list !== 'followers' && list !== 'following') {
            return res.status(400).json({ error: 'Invalid list type. Must be followers or following' });
        }

        if (!process.env.IG_COOKIE) {
            return res.status(500).json({ error: 'IG_COOKIE not configured.' });
        }

        let url = `${IG_WEB_BASE}/api/v1/friendships/${userId}/${list}/?count=100`;
        if (maxId) {
            url += `&max_id=${encodeURIComponent(maxId)}`;
        }
        if (rankToken) {
            url += `&rank_token=${encodeURIComponent(rankToken)}`;
        }

        const data = await igFetch(url);
        
        if (!data || !Array.isArray(data.users)) {
            throw new Error('Instagram did not return a valid list of users. The session might be temporarily rate-limited or requires verification.');
        }
        
        // Map required fields to keep payload lightweight
        const users = data.users.map(u => ({
            username: u.username,
            fullName: u.full_name,
            avatar: proxyUrl(u.profile_pic_url)
        }));

        res.json({
            users,
            next_max_id: data?.next_max_id || null
        });
    } catch (err) {
        console.error('[/api/friendships] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════
// API ENDPOINT 5: Media Proxy
// Proxy images and videos from Instagram CDN to bypass CORS
// ════════════════════════════════════════════════════════════
app.get('/api/media-proxy', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('Missing url parameter');

        // Security: Only allow proxying from Instagram CDN domains
        const parsed = new URL(url);
        const allowedHosts = [
            'instagram.com', 'cdninstagram.com',
            'fbcdn.net', 'fna.fbcdn.net',
        ];
        const isAllowed = allowedHosts.some(host => parsed.hostname.endsWith(host));
        if (!isAllowed) {
            return res.status(403).send('Domain not allowed for proxying');
        }

        const igRes = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': 'https://www.instagram.com/',
                'Accept': 'image/webp,image/avif,image/*,video/*,*/*;q=0.8',
            },
            responseType: 'stream',
            validateStatus: () => true
        });

        if (igRes.status !== 200) {
            return res.status(igRes.status).send('Media fetch failed');
        }

        // Forward relevant headers
        const contentType = igRes.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', contentType);

        const contentLength = igRes.headers['content-length'];
        if (contentLength) res.setHeader('Content-Length', contentLength);

        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Stream the response body
        igRes.data.pipe(res);
    } catch (err) {
        console.error('[/api/media-proxy] Error:', err.message);
        if (!res.headersSent) {
            res.status(500).send('Proxy error');
        }
    }
});

// ─── Fallback: serve index.html for SPA-like routing ───
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ───
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\nStoriesIG Server running at http://localhost:${PORT}`);
        console.log(`   ├─ Frontend:    http://localhost:${PORT}`);
        console.log(`   ├─ API Base:    http://localhost:${PORT}/api/`);
        console.log(`   └─ Cookie Set:  ${process.env.IG_COOKIE ? 'Yes' : 'No (set IG_COOKIE in .env)'}\n`);
    });
}

module.exports = app;
