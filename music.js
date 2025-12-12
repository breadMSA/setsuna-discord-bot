const { Player, QueryType } = require('discord-player');
const { EmbedBuilder } = require('discord.js');

// Music player instance (will be initialized in setupMusicPlayer)
let player = null;

/**
 * Initialize the music player
 * @param {Client} client - Discord client instance
 */
function setupMusicPlayer(client) {
    player = new Player(client, {
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    // Load default extractors
    player.extractors.loadDefault();

    // Event: Track starts playing
    player.events.on('playerStart', (queue, track) => {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 正在播放')
            .setDescription(`**${track.title}**`)
            .addFields(
                { name: '作者', value: track.author, inline: true },
                { name: '時長', value: track.duration, inline: true }
            )
            .setThumbnail(track.thumbnail)
            .setFooter({ text: `由 ${track.requestedBy.username} 點播` });

        queue.metadata.channel.send({ embeds: [embed] });
    });

    // Event: Track ends
    player.events.on('audioTrackAdd', (queue, track) => {
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ 已加入播放列表')
            .setDescription(`**${track.title}**`)
            .addFields(
                { name: '作者', value: track.author, inline: true },
                { name: '時長', value: track.duration, inline: true }
            )
            .setThumbnail(track.thumbnail);

        queue.metadata.channel.send({ embeds: [embed] });
    });

    // Event: Queue ends
    player.events.on('emptyQueue', (queue) => {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('👋 播放列表已清空')
            .setDescription('所有歌曲已播放完畢，我將離開語音頻道。');

        queue.metadata.channel.send({ embeds: [embed] });
    });

    // Event: Error handling
    player.events.on('playerError', (queue, error) => {
        console.error(`播放錯誤: ${error.message}`);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 播放錯誤')
            .setDescription('播放時發生錯誤，已跳過此歌曲。');

        queue.metadata.channel.send({ embeds: [embed] });
    });

    console.log('🎵 音樂播放器已初始化');
}

/**
 * Get the music player instance
 * @returns {Player} The player instance
 */
function getPlayer() {
    return player;
}

/**
 * Format duration from milliseconds to MM:SS or HH:MM:SS
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
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
    return member.voice.channel !== null;
}

/**
 * Check if bot is in the same voice channel as user
 * @param {GuildMember} member - Guild member
 * @param {Guild} guild - Guild
 * @returns {boolean} True if in same channel
 */
function isInSameVoiceChannel(member, guild) {
    const botVoiceChannel = guild.members.me.voice.channel;
    if (!botVoiceChannel) return false;
    return member.voice.channel.id === botVoiceChannel.id;
}

module.exports = {
    setupMusicPlayer,
    getPlayer,
    formatDuration,
    createErrorEmbed,
    createSuccessEmbed,
    isInVoiceChannel,
    isInSameVoiceChannel
};
