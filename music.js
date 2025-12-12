const { Kazagumo, Plugins } = require('kazagumo');
const { Connectors } = require('shoukaku');
const { EmbedBuilder } = require('discord.js');

// Kazagumo instance (will be initialized in setupMusicPlayer)
let kazagumo = null;

// Public Lavalink nodes - these are free public servers
const LAVALINK_NODES = [
    {
        name: 'Lavalink1',
        url: 'lavalink.jirayu.net:13592',
        auth: 'youshallnotpass',
        secure: false
    },
    {
        name: 'Lavalink2',
        url: 'lava.horizxon.studio:80',
        auth: 'horizxon.studio',
        secure: false
    }
];

/**
 * Initialize the music player with Lavalink
 * @param {Client} client - Discord client instance
 */
function setupMusicPlayer(client) {
    kazagumo = new Kazagumo({
        defaultSearchEngine: 'youtube',
        plugins: [new Plugins.PlayerMoved(client)],
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        }
    }, new Connectors.DiscordJS(client), LAVALINK_NODES);

    // Event: Lavalink ready
    kazagumo.shoukaku.on('ready', (name) => {
        console.log(`🎵 Lavalink 節點 ${name} 已連接`);
    });

    // Event: Lavalink error
    kazagumo.shoukaku.on('error', (name, error) => {
        console.error(`❌ Lavalink 節點 ${name} 錯誤:`, error);
    });

    // Event: Lavalink close
    kazagumo.shoukaku.on('close', (name, code, reason) => {
        console.warn(`⚠️ Lavalink 節點 ${name} 已關閉 (${code}): ${reason}`);
    });

    // Event: Player start
    kazagumo.on('playerStart', (player, track) => {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 正在播放')
            .setDescription(`**${track.title}**`)
            .addFields(
                { name: '作者', value: track.author || '未知', inline: true },
                { name: '時長', value: formatDuration(track.length) || '未知', inline: true }
            )
            .setThumbnail(track.thumbnail)
            .setFooter({ text: `由 ${track.requester?.username || '未知'} 點播` });

        const channel = client.channels.cache.get(player.textId);
        if (channel) channel.send({ embeds: [embed] }).catch(console.error);
    });

    // Event: Player end
    kazagumo.on('playerEnd', (player) => {
        // Handled by playerEmpty if queue is empty
    });

    // Event: Queue empty
    kazagumo.on('playerEmpty', (player) => {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('👋 播放列表已清空')
            .setDescription('所有歌曲已播放完畢。');

        const channel = client.channels.cache.get(player.textId);
        if (channel) channel.send({ embeds: [embed] }).catch(console.error);

        // Destroy player after a delay
        setTimeout(() => {
            if (player && !player.queue.current) {
                player.destroy();
            }
        }, 300000); // 5 minutes
    });

    // Event: Player error
    kazagumo.on('playerError', (player, error) => {
        console.error('播放器錯誤:', error);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 播放錯誤')
            .setDescription(`播放時發生錯誤：${error.message || '未知錯誤'}`);

        const channel = client.channels.cache.get(player.textId);
        if (channel) channel.send({ embeds: [embed] }).catch(console.error);
    });

    console.log('🎵 音樂播放器已初始化 (使用 Lavalink)');
}

/**
 * Get the kazagumo instance
 * @returns {Kazagumo} The kazagumo instance
 */
function getPlayer() {
    return kazagumo;
}

/**
 * Format duration from milliseconds to MM:SS or HH:MM:SS
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
    if (!ms) return '00:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Create an error embed
 * @param {string} message - Error message
 * @returns {EmbedBuilder} Error embed
 */
function createErrorEmbed(message) {
    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ 錯誤')
        .setDescription(message);
}

/**
 * Create a success embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} Success embed
 */
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(title)
        .setDescription(description);
}

/**
 * Check if user is in a voice channel
 * @param {GuildMember} member - Guild member
 * @returns {boolean} True if in voice channel
 */
function isInVoiceChannel(member) {
    return member.voice && member.voice.channel !== null;
}

module.exports = {
    setupMusicPlayer,
    getPlayer,
    formatDuration,
    createErrorEmbed,
    createSuccessEmbed,
    isInVoiceChannel
};
