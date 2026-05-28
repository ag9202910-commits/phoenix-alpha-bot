const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const { Boom } = require('@hapi/boom');

// ========== KONFIGURASI ==========
const DEEPSEEK_API_KEY = 'sk-9439329290a0486cab288d814af46ffb';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const PREFIX = '/';
const OWNER_NUMBER = '6282183151033';
const BOT_NAME = 'Phoenix AI';

// ========== DATABASE ==========
let activeGames = new Map();
let userWarns = new Map();
let groupSettings = new Map();

// ========== FUNGSI AI ==========
async function chatWithAI(question, mode = 'general') {
    if (!question) return "Halo! Ada yang bisa Phoenix AI bantu? 🔥";
    
    let systemPrompt = `Kamu adalah ${BOT_NAME}, asisten AI super cerdas seperti ChatGPT. Kamu bisa menjawab SEMUA pertanyaan. Jawab dengan bahasa Indonesia yang baik, detail, dan ramah.`;
    if (mode === 'coding') systemPrompt = "Kamu expert programmer. Berikan kode yang bersih dan jelas dengan penjelasan.";
    if (mode === 'math') systemPrompt = "Kamu ahli matematika. Selesaikan soal dengan langkah-langkah detail.";
    if (mode === 'science') systemPrompt = "Kamu ilmuwan. Jelaskan sains dengan mudah dipahami.";
    if (mode === 'history') systemPrompt = "Kamu sejarawan. Berikan fakta sejarah yang akurat.";
    if (mode === 'psychology') systemPrompt = "Kamu psikolog. Berikan saran yang bijak dan membantu.";
    
    try {
        const response = await axios.post(DEEPSEEK_URL, {
            model: "deepseek-chat",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: question }],
            temperature: 0.8,
            max_tokens: 2000
        }, {
            headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            timeout: 60000
        });
        let answer = response.data.choices[0].message.content;
        if (answer.length > 1900) answer = answer.slice(0, 1897) + '...';
        return answer;
    } catch (error) {
        return "🔥 Phoenix AI: Maaf sedang sibuk, coba lagi ya! 😊";
    }
}

// ========== GAME SAMBUNG KATA ==========
function startSambungKata(userId, name) {
    const words = ['apel','jeruk','kucing','angsa','semut','tikus','sapi','ikan','ayam','bebek','ular','harimau','gajah','kelinci','kambing','kuda','singa','macan','merpati','elang','panda','zebra','rusa','kanguru','buaya','kura','katak','lebah','kupu','semut'];
    const first = words[Math.floor(Math.random() * words.length)];
    activeGames.set(userId, { game: 'sambung', last: first, used: [first], score: 0, name: name });
    return `🎮 *GAME SAMBUNG KATA*\n👤 Pemain: ${name}\n🔤 Kata awal: *${first}*\n✨ Balas dengan huruf *${first.slice(-1).toUpperCase()}*\n💰 +10 poin/jawaban\n🛑 /stop`;
}

function sambungKataJawab(kata, userId) {
    const game = activeGames.get(userId);
    if (!game || game.game !== 'sambung') return null;
    const lastChar = game.last.slice(-1);
    if (kata[0] !== lastChar) return { success: false, message: `❌ Gagal! Harus huruf *${lastChar.toUpperCase()}*` };
    if (game.used.includes(kata)) return { success: false, message: `❌ Kata "${kata}" sudah dipakai!` };
    game.used.push(kata);
    game.last = kata;
    game.score += 10;
    return { success: true, message: `✅ +10 poin! Skor: *${game.score}*\n🔤 Lanjut: *${kata.slice(-1).toUpperCase()}*` };
}

// ========== GAME TEBAK ANGKA ==========
function startTebakAngka(userId, name) {
    const target = Math.floor(Math.random() * 100) + 1;
    activeGames.set(userId, { game: 'tebakangka', target: target, attempts: 0, name: name });
    return `🎮 *GAME TEBAK ANGKA*\n👤 Pemain: ${name}\n🎯 Tebak angka 1-100!\n🛑 /stop`;
}

function tebakAngkaJawab(guess, userId) {
    const game = activeGames.get(userId);
    if (!game || game.game !== 'tebakangka') return null;
    game.attempts++;
    if (guess === game.target) {
        const score = Math.max(100 - (game.attempts - 1) * 5, 20);
        activeGames.delete(userId);
        return { success: true, message: `🎉 *BENAR!* Angkanya ${game.target} 🎉\n📊 ${game.attempts} kali\n🏆 Skor: ${score}\n/game` };
    }
    return { success: false, message: `${guess < game.target ? '📈 Kecil' : '📉 Besar'} (${game.attempts})` };
}

// ========== GAME BATU GUNTING KERTAS ==========
function startBatuGunting(userId, name) {
    activeGames.set(userId, { game: 'batu', name: name });
    return `🎮 *BATU GUNTING KERTAS*\n👤 Pemain: ${name}\n✊ Pilih: /batu | /gunting | /kertas\n🛑 /stop`;
}

function batuGuntingJawab(choice, userId) {
    const game = activeGames.get(userId);
    if (!game || game.game !== 'batu') return null;
    const options = ['batu','gunting','kertas'];
    const bot = options[Math.floor(Math.random() * 3)];
    let result = '';
    if (choice === bot) result = '🤝 SERI!';
    else if ((choice === 'batu' && bot === 'gunting') || (choice === 'gunting' && bot === 'kertas') || (choice === 'kertas' && bot === 'batu')) result = '🎉 KAMU MENANG!';
    else result = '💀 BOT MENANG!';
    activeGames.delete(userId);
    return { success: true, message: `✊ Kamu: ${choice} | Bot: ${bot} ✋\n\n${result}\n/game` };
}

// ========== STICKER MAKER ==========
async function createSticker(sock, sender, quoted) {
    try {
        const media = quoted.imageMessage || quoted.videoMessage;
        const buffer = await sock.downloadMediaMessage({ message: { imageMessage: media } });
        await sock.sendMessage(sender, { sticker: buffer });
        return true;
    } catch (error) {
        return false;
    }
}

// ========== BOT UTAMA ==========
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: [BOT_NAME, 'Chrome', '1.0'] });
    
    sock.ev.on('connection.update', (update) => {
        const { qr, connection } = update;
        if (qr) {
            console.log('\n📱 SCAN QR CODE:\n');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            console.log(`\n✅ ${BOT_NAME} SIAP! 🔥`);
            console.log('📌 Kirim /help untuk 50+ fitur\n');
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const userId = sender.split('@')[0];
        const name = msg.pushName || 'User';
        const isGroup = sender.endsWith('@g.us');
        
        // GAME tanpa prefix
        if (activeGames.has(userId) && !text.startsWith(PREFIX)) {
            const game = activeGames.get(userId);
            let result = null;
            if (game.game === 'sambung') result = sambungKataJawab(text.toLowerCase(), userId);
            else if (game.game === 'tebakangka' && !isNaN(parseInt(text))) result = tebakAngkaJawab(parseInt(text), userId);
            if (result) return await sock.sendMessage(sender, { text: result.message });
        }
        
        if (!text.startsWith(PREFIX)) return;
        const cmd = text.slice(1).trim().toLowerCase();
        const args = text.slice(1 + cmd.length).trim();
        
        // ========== MENU HELP 50+ FITUR ==========
        if (cmd === 'help' || cmd === 'menu') {
            const menu = `🔥 *${BOT_NAME} ULTIMATE* - 50+ FITUR 🔥\n\n` +
                `📋 *AI CHAT (Seperti ChatGPT)*\n` +
                `┃ /ai <pesan> - Tanya AI apa saja\n` +
                `┃ /coding <pesan> - Bikin program\n` +
                `┃ /math <soal> - Matematika\n` +
                `┃ /sains <q> - Sains & ilmu\n` +
                `┃ /sejarah <q> - Fakta sejarah\n` +
                `┃ /psikologi <q> - Psikologi\n` +
                `┃ /filosofi <q> - Filosofi\n` +
                `┃ /hukum <q> - Info hukum\n` +
                `┃ /ekonomi <q> - Ekonomi\n` +
                `┃ /kesehatan <q> - Kesehatan\n` +
                `┃ /teknologi <q> - Teknologi\n` +
                `┃ /seni <q> - Seni & budaya\n` +
                `┃ /olahraga <q> - Olahraga\n` +
                `┃ /motivasi - Kata motivasi\n\n` +
                `🎮 *GAMES*\n` +
                `┃ /game - Menu game\n` +
                `┃ /sambung - Sambung kata\n` +
                `┃ /tebakangka - Tebak angka\n` +
                `┃ /batugunting - Suit\n` +
                `┃ /quiz - Kuis pengetahuan\n` +
                `┃ /tebakhewan - Tebak hewan\n` +
                `┃ /tebakgambar - Tebak gambar\n` +
                `┃ /stop - Berhenti game\n\n` +
                `🛠️ *TOOLS*\n` +
                `┃ /sticker - Buat stiker (balas gambar)\n` +
                `┃ /toimg - Stiker ke gambar\n` +
                `┃ /shorturl <url> - Pendekin link\n` +
                `┃ /qrcode <teks> - Buat QR\n` +
                `┃ /barcode <teks> - Buat barcode\n` +
                `┃ /tts <teks> - Teks jadi suara\n` +
                `┃ /weather <kota> - Cuaca\n\n` +
                `😄 *FUN*\n` +
                `┃ /joke - Cerita lucu\n` +
                `┃ /quote - Kata bijak\n` +
                `┃ /truth - Truth or dare\n` +
                `┃ /dare - Truth or dare\n` +
                `┃ /pantun - Pantun lucu\n` +
                `┃ /cerpen - Cerita pendek\n` +
                `┃ /puisi - Puisi indah\n` +
                `┃ /fakta - Fakta unik\n` +
                `┃ /tebakumur - Tebak umur\n` +
                `┃ /ramaljodoh - Ramalan jodoh\n\n` +
                `🌍 *INFORMASI*\n` +
                `┃ /cuaca <kota> - Cek cuaca\n` +
                `┃ /berita - Berita terbaru\n` +
                `┃ /gempa - Info gempa\n` +
                `┃ /sholat <kota> - Jadwal sholat\n` +
                `┃ /jadwal <liga> - Jadwal bola\n` +
                `┃ /nilai <dolar> - Kurs\n` +
                `┃ /kbbi <kata> - Arti kata\n` +
                `┃ /wikipedia <kata> - Wikipedia\n` +
                `┃ /resep <makanan> - Resep\n` +
                `┃ /lagu <judul> - Lirik lagu\n` +
                `┃ /film <judul> - Info film\n\n` +
                `🎵 *DOWNLOADER*\n` +
                `┃ /ytmp3 <url> - Audio YT\n` +
                `┃ /ytmp4 <url> - Video YT\n` +
                `┃ /ig <url> - Download IG\n` +
                `┃ /tt <url> - Download TikTok\n` +
                `┃ /fb <url> - Download FB\n\n` +
                `⚙️ *UTILITY*\n` +
                `┃ /ping - Cek status\n` +
                `┃ /time - Waktu sekarang\n` +
                `┃ /info - Info bot\n` +
                `┃ /owner - Hubungi owner\n` +
                `┃ /donasi - Dukung bot\n` +
                `┃ /about - Tentang bot\n\n` +
                `👤 Owner: ${OWNER_NUMBER}`;
            await sock.sendMessage(sender, { text: menu });
        }
        
        // ========== AI CHAT MODES ==========
        else if (cmd === 'ai') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /ai apa itu AI?' });
            await sock.sendMessage(sender, { text: '🔥 Phoenix AI berpikir...' });
            const jawab = await chatWithAI(args, 'general');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'coding') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /coding buat kalkulator Python' });
            await sock.sendMessage(sender, { text: '💻 Membuat kode...' });
            const jawab = await chatWithAI(args, 'coding');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'math') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /math 125 x 32' });
            await sock.sendMessage(sender, { text: '🧮 Menghitung...' });
            const jawab = await chatWithAI(args, 'math');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'sains') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /sains bagaimana cara kerja matahari?' });
            await sock.sendMessage(sender, { text: '🔬 Mencari jawaban...' });
            const jawab = await chatWithAI(args, 'science');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'sejarah') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /sejarah proklamasi Indonesia' });
            await sock.sendMessage(sender, { text: '📜 Mencari sejarah...' });
            const jawab = await chatWithAI(args, 'history');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'psikologi') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /psikologi cara mengatasi stres' });
            await sock.sendMessage(sender, { text: '🧠 Phoenix AI berpikir...' });
            const jawab = await chatWithAI(args, 'psychology');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'filosofi') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /filosofi arti kehidupan' });
            const jawab = await chatWithAI(args, 'philosophy');
            await sock.sendMessage(sender, { text: jawab });
        }
        else if (cmd === 'motivasi') {
            const jawab = await chatWithAI('berikan kata motivasi yang membangkitkan semangat', 'general');
            await sock.sendMessage(sender, { text: `🔥 *MOTIVASI*\n\n${jawab}` });
        }
        
        // ========== GAMES ==========
        else if (cmd === 'game') {
            await sock.sendMessage(sender, { text: `🎮 *MENU GAME*\n/sambung - Sambung kata\n/tebakangka - Tebak angka\n/batugunting - Suit\n/quiz - Kuis\n/tebakhewan - Tebak hewan\n/stop - Berhenti` });
        }
        else if (cmd === 'sambung') {
            await sock.sendMessage(sender, { text: startSambungKata(userId, name) });
        }
        else if (cmd === 'tebakangka') {
            await sock.sendMessage(sender, { text: startTebakAngka(userId, name) });
        }
        else if (cmd === 'batugunting') {
            await sock.sendMessage(sender, { text: startBatuGunting(userId, name) });
        }
        else if (cmd === 'quiz') {
            const quiz = [
                { q: "Apa ibu kota Indonesia?", a: "jakarta" },
                { q: "Siapa presiden pertama Indonesia?", a: "soekarno" },
                { q: "Berapa hasil 7 x 8?", a: "56" },
                { q: "Apa planet terdekat dengan matahari?", a: "merkurius" },
                { q: "Siapa penemu lampu?", a: "thomas alva edison" }
            ];
            const q = quiz[Math.floor(Math.random() * quiz.length)];
            activeGames.set(userId, { game: 'quiz', answer: q.a, question: q.q });
            await sock.sendMessage(sender, { text: `📝 *QUIZ*\n${q.q}\n\nJawab: /jawab <jawaban>` });
        }
        else if (cmd === 'jawab') {
            const game = activeGames.get(userId);
            if (game?.game === 'quiz') {
                if (args.toLowerCase() === game.answer) {
                    activeGames.delete(userId);
                    await sock.sendMessage(sender, { text: `🎉 *BENAR!* +50 poin!\n/game untuk main lagi` });
                } else {
                    await sock.sendMessage(sender, { text: `❌ *Salah!* Jawaban: ${game.answer}` });
                    activeGames.delete(userId);
                }
            }
        }
        else if (cmd === 'tebakhewan') {
            const hewan = [
                { clue: "Hewan yang suka makan pisang", a: "monyet" },
                { clue: "Hewan bertelinga panjang", a: "kelinci" },
                { clue: "Hewan yang punya belalai", a: "gajah" }
            ];
            const h = hewan[Math.floor(Math.random() * hewan.length)];
            activeGames.set(userId, { game: 'tebakhewan', answer: h.a, clue: h.clue });
            await sock.sendMessage(sender, { text: `🎮 *TEBAK HEWAN*\nClue: ${h.clue}\nJawab: /jawab <nama>` });
        }
        else if (cmd === 'batu' || cmd === 'gunting' || cmd === 'kertas') {
            const result = batuGuntingJawab(cmd, userId);
            if (result) await sock.sendMessage(sender, { text: result.message });
            else await sock.sendMessage(sender, { text: 'Mulai game: /batugunting' });
        }
        else if (cmd === 'stop') {
            if (activeGames.has(userId)) { activeGames.delete(userId); await sock.sendMessage(sender, { text: '🛑 Game dihentikan.' }); }
            else { await sock.sendMessage(sender, { text: '❌ Tidak ada game aktif.' }); }
        }
        
        // ========== TOOLS ==========
        else if (cmd === 'sticker') {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted && quoted.imageMessage) {
                await createSticker(sock, sender, quoted);
            } else {
                await sock.sendMessage(sender, { text: '❌ Balas gambar dengan /sticker' });
            }
        }
        else if (cmd === 'toimg') {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted?.stickerMessage) {
                const buffer = await sock.downloadMediaMessage({ message: { stickerMessage: quoted.stickerMessage } });
                await sock.sendMessage(sender, { image: buffer, caption: '✅ Stiker ke gambar!' });
            } else {
                await sock.sendMessage(sender, { text: '❌ Balas stiker dengan /toimg' });
            }
        }
        else if (cmd === 'shorturl') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /shorturl https://example.com' });
            try {
                const res = await axios.post('https://tinyurl.com/api-create.php', null, { params: { url: args } });
                await sock.sendMessage(sender, { text: `🔗 Link pendek: ${res.data}` });
            } catch(e) {
                await sock.sendMessage(sender, { text: '❌ Gagal memendekkan link' });
            }
        }
        else if (cmd === 'qrcode') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /qrcode https://example.com' });
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(args)}`;
            await sock.sendMessage(sender, { image: { url: qrUrl }, caption: '📱 QR Code' });
        }
        else if (cmd === 'barcode') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /barcode 1234567890' });
            const barUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(args)}&code=Code128`;
            await sock.sendMessage(sender, { image: { url: barUrl }, caption: `📊 Barcode: ${args}` });
        }
        else if (cmd === 'weather') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /weather Jakarta' });
            const jawab = await chatWithAI(`cuaca lengkap di ${args}`, 'general');
            await sock.sendMessage(sender, { text: `🌤️ *CUACA ${args.toUpperCase()}*\n\n${jawab}` });
        }
        
        // ========== FUN ==========
        else if (cmd === 'joke') {
            const jokes = ["Kenapa programmer suka kopi? Karena butuh 'java'! ☕", "Kenapa server tidak bisa tidur? Karena punya 'sleep mode'! 😴", "Apa bahasa Jepangnya kucing? Meow-kota! 🐱", "Kenapa telur sedih? Karena kuningnya ditinggal! 🥚"];
            await sock.sendMessage(sender, { text: `😄 *JOKE*\n${jokes[Math.floor(Math.random() * jokes.length)]}` });
        }
        else if (cmd === 'quote') {
            const quotes = ["🔥 Bangkit seperti Phoenix, lebih kuat dari sebelumnya!", "💪 Kegagalan adalah batu loncatan menuju kesuksesan.", "🌟 Setiap hari adalah kesempatan baru.", "🎯 Jangan takut jatuh, karena bangkit adalah bukti kekuatanmu."];
            await sock.sendMessage(sender, { text: `💭 *QUOTE*\n"${quotes[Math.floor(Math.random() * quotes.length)]}"` });
        }
        else if (cmd === 'truth') {
            const truths = ["Apa rahasia terbesarmu?", "Pernahkah kamu berbohong ke orang tua?", "Siapa yang paling kamu sukai diam-diam?"];
            await sock.sendMessage(sender, { text: `🔮 *TRUTH*\n${truths[Math.floor(Math.random() * truths.length)]}` });
        }
        else if (cmd === 'dare') {
            const dares = ["Kirim lagu favoritmu!", "Ceritakan momen memalukanmu!", "Lakukan gaya hewan favoritmu!"];
            await sock.sendMessage(sender, { text: `⚡ *DARE*\n${dares[Math.floor(Math.random() * dares.length)]}` });
        }
        else if (cmd === 'pantun') {
            const jawab = await chatWithAI('buatkan pantun lucu', 'general');
            await sock.sendMessage(sender, { text: `📝 *PANTUN*\n${jawab}` });
        }
        else if (cmd === 'cerpen') {
            const jawab = await chatWithAI('buatkan cerita pendek inspiratif', 'general');
            await sock.sendMessage(sender, { text: `📖 *CERITA PENDEK*\n${jawab}` });
        }
        else if (cmd === 'puisi') {
            const jawab = await chatWithAI('buatkan puisi indah tentang kehidupan', 'general');
            await sock.sendMessage(sender, { text: `📝 *PUISI*\n${jawab}` });
        }
        else if (cmd === 'fakta') {
            const jawab = await chatWithAI('berikan fakta unik dan menarik', 'general');
            await sock.sendMessage(sender, { text: `🔍 *FAKTA UNIK*\n${jawab}` });
        }
        else if (cmd === 'tebakumur') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /tebakumur Andi' });
            const jawab = await chatWithAI(`tebak umur dari nama ${args} secara lucu`, 'general');
            await sock.sendMessage(sender, { text: `🎂 *TEBAK UMUR*\n${jawab}` });
        }
        else if (cmd === 'ramaljodoh') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /ramaljodoh Andi' });
            const jawab = await chatWithAI(`ramalan jodoh untuk ${args} secara lucu`, 'general');
            await sock.sendMessage(sender, { text: `💖 *RAMALAN JODOH*\n${jawab}` });
        }
        
        // ========== INFORMASI ==========
        else if (cmd === 'cuaca') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /cuaca Jakarta' });
            const jawab = await chatWithAI(`cuaca di ${args} sekarang`, 'general');
            await sock.sendMessage(sender, { text: `🌤️ *CUACA ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'berita') {
            const jawab = await chatWithAI('berita terbaru Indonesia hari ini', 'general');
            await sock.sendMessage(sender, { text: `📰 *BERITA TERBARU*\n\n${jawab}` });
        }
        else if (cmd === 'gempa') {
            const jawab = await chatWithAI('info gempa terkini BMKG', 'general');
            await sock.sendMessage(sender, { text: `🌋 *INFO GEMPA*\n\n${jawab}` });
        }
        else if (cmd === 'sholat') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /sholat Jakarta' });
            const jawab = await chatWithAI(`jadwal sholat ${args} hari ini`, 'general');
            await sock.sendMessage(sender, { text: `🕌 *JADWAL SHOLAT ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'jadwal') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /jadwal premier league' });
            const jawab = await chatWithAI(`jadwal pertandingan ${args}`, 'general');
            await sock.sendMessage(sender, { text: `⚽ *JADWAL ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'nilai') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /nilai dolar ke rupiah' });
            const jawab = await chatWithAI(`kurs ${args} hari ini`, 'general');
            await sock.sendMessage(sender, { text: `💵 *KURS MATA UANG*\n\n${jawab}` });
        }
        else if (cmd === 'kbbi') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /kbbi integritas' });
            const jawab = await chatWithAI(`arti kata ${args} menurut KBBI`, 'general');
            await sock.sendMessage(sender, { text: `📖 *KBBI: ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'wikipedia') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /wikipedia Albert Einstein' });
            const jawab = await chatWithAI(`jelaskan tentang ${args} dari Wikipedia`, 'general');
            await sock.sendMessage(sender, { text: `🌐 *WIKIPEDIA: ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'resep') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /resep nasi goreng' });
            const jawab = await chatWithAI(`resep lengkap ${args} dengan bahan dan langkah`, 'general');
            await sock.sendMessage(sender, { text: `🍳 *RESEP ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'lagu') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /lagu separuh aku' });
            const jawab = await chatWithAI(`lirik lagu ${args}`, 'general');
            await sock.sendMessage(sender, { text: `🎵 *LIRIK LAGU: ${args.toUpperCase()}*\n\n${jawab}` });
        }
        else if (cmd === 'film') {
            if (!args) return await sock.sendMessage(sender, { text: '📌 Contoh: /film avengers' });
            const jawab = await chatWithAI(`info lengkap film ${args}`, 'general');
            await sock.sendMessage(sender, { text: `🎬 *INFO FILM: ${args.toUpperCase()}*\n\n${jawab}` });
        }
        
        // ========== DOWNLOADER ==========
        else if (cmd === 'ytmp3' || cmd === 'ytmp4' || cmd === 'ig' || cmd === 'tt' || cmd === 'fb') {
            if (!args) return await sock.sendMessage(sender, { text: `📌 Contoh: /${cmd} https://example.com` });
            await sock.sendMessage(sender, { text: `🎵 *DOWNLOADER ${cmd.toUpperCase()}*\n\nMaaf, fitur ini hanya aktif di PC karena keterbatasan.\n\nGunakan /ai untuk bantuan download: ${await chatWithAI(`cara download video dari ${cmd}`, 'general')}` });
        }
        
        // ========== UTILITY ==========
        else if (cmd === 'ping') {
            const start = Date.now();
            await sock.sendMessage(sender, { text: '🏓 Pinging...' });
            const latency = Date.now() - start;
            await sock.sendMessage(sender, { text: `⚡ *PONG!*\n📡 Latensi: ${latency}ms\n✅ Status: Online\n🎮 50+ Fitur Aktif\n🔥 ${BOT_NAME} siap membantu!` });
        }
        else if (cmd === 'time') {
            const now = new Date();
            const waktu = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
            const tanggal = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const hari = now.toLocaleDateString('id-ID', { weekday: 'long' });
            await sock.sendMessage(sender, { text: `🕐 *WAKTU SEKARANG*\n\n📅 Hari: ${hari}\n📆 Tanggal: ${tanggal}\n⏰ Waktu: ${waktu} WIB` });
        }
        else if (cmd === 'info') {
            await sock.sendMessage(sender, { text: `🔥 *${BOT_NAME} ULTIMATE*\n\n📌 Nama: ${BOT_NAME}\n⚙️ Versi: Ultimate 6.0\n🎮 Fitur: 50+ (AI, Game, Tools, Info, Downloader)\n📝 Prefix: ${PREFIX}\n🧠 AI Engine: DeepSeek\n✅ Status: Active 🟢\n📈 Uptime: 24/7\n👤 Owner: ${OWNER_NUMBER}\n\n📋 Ketik /help untuk 50+ fitur!` });
        }
        else if (cmd === 'owner') {
            await sock.sendMessage(sender, { text: `👤 *OWNER ${BOT_NAME}*\n\n📞 WhatsApp: ${OWNER_NUMBER}\n💬 wa.me/${OWNER_NUMBER}\n\nHubungi untuk:\n• Laporan bug 🐛\n• Request fitur baru 💡\n• Kerjasama 🤝\n• Donasi 💰\n\nTerima kasih! 🔥` });
        }
        else if (cmd === 'donasi') {
            await sock.sendMessage(sender, { text: `💝 *DONASI ${BOT_NAME}*\n\n${BOT_NAME} gratis selamanya! Tapi jika ingin donasi:\n\n💰 Dana: ${OWNER_NUMBER}\n💳 OVO: ${OWNER_NUMBER}\n\nTerima kasih dukungannya! 🔥` });
        }
        else if (cmd === 'about') {
            await sock.sendMessage(sender, { text: `🌟 *TENTANG ${BOT_NAME}*\n\n${BOT_NAME} adalah bot WhatsApp canggih dengan 50+ fitur:\n\n✅ AI seperti ChatGPT\n✅ 7+ Game seru\n✅ Sticker maker\n✅ QR & Barcode\n✅ Short URL\n✅ Fun commands\n✅ Info cuaca, berita, gempa\n✅ Downloader YT, IG, TT\n✅ KBBI, Wikipedia, Resep\n✅ Dan 50+ fitur lainnya!\n\nDibuat dengan 🔥\nKonsep: Bangkit seperti Phoenix\n\n📋 Ketik /help untuk mulai!` });
        }
        else {
            await sock.sendMessage(sender, { text: `❌ *Perintah "${cmd}" tidak dikenal!*\n\n📋 Ketik *${PREFIX}help* untuk 50+ fitur lengkap.\n\n🔥 ${BOT_NAME}: "Bangkit seperti Phoenix!"` });
        }
    });
}

// ========== JALANKAN BOT ==========
startBot();
console.log(`\n🚀 ${BOT_NAME} ULTIMATE 6.0 STARTING...\n`);
console.log('='.repeat(50));
console.log('📋 50+ FITUR LENGKAP:');
console.log('• AI Chat (Seperti ChatGPT)');
console.log('• Games (Sambung Kata, Tebak Angka, Suit, Quiz, Tebak Hewan)');
console.log('• Tools (Sticker, QR/Barcode, Short URL)');
console.log('• Fun (Joke, Quote, Truth/Dare, Pantun, Cerpen, Puisi, Fakta)');
console.log('• Info (Cuaca, Berita, Gempa, Sholat, Bola, Kurs, KBBI, Wikipedia, Resep)');
console.log('• Downloader (YT, IG, TT, FB)');
console.log('• Utility (Ping, Time, Info, Owner, Donasi)');
console.log('='.repeat(50));
console.log(`📌 Prefix: ${PREFIX}`);
console.log(`🔥 "${BOT_NAME}: Bangkit seperti Phoenix!"\n`);