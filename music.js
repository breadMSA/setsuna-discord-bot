const { Player } = require('discord-player');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const { EmbedBuilder } = require('discord.js');

// Set FFmpeg path before anything else
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

// Music player instance (will be initialized in setupMusicPlayer)
let player = null;

/**
 * Initialize the music player
 * @param {Client} client - Discord client instance
 */
async function setupMusicPlayer(client) {
    player = new Player(client, {
        skipFFmpeg: false,
        ytdlOptions: {
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        }
    });

    // Register the YouTubei extractor for stable YouTube support
    await player.extractors.register(YoutubeiExtractor, {});

    // Load default extractors for other sources (Spotify, SoundCloud, etc.)
    await player.extractors.loadDefault((ext) => ext !== 'YouTubeExtractor');

    // Event: Track starts playing
    player.events.on('playerStart', (queue, track) => {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 正在播放')
            .setDescription(`**${track.title}**`)
            .addFields(
                { name: '作者', value: track.author || '未知', inline: true },
                { name: '時長', value: track.duration || '未知', inline: true }
            )
            .setThumbnail(track.thumbnail)
            .setFooter({ text: `由 ${track.requestedBy?.username || '未知'} 點播` });

        queue.metadata.channel.send({ embeds: [embed] }).catch(console.error);
    });

    // Event: Track added to queue
    player.events.on('audioTrackAdd', (queue, track) => {
        if (queue.tracks.size > 0 || queue.isPlaying()) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ 已加入播放列表')
                .setDescription(`**${track.title}**`)
                .addFields(
                    { name: '作者', value: track.author || '未知', inline: true },
                    { name: '時長', value: track.duration || '未知', inline: true }
                )
                .setThumbnail(track.thumbnail);

            queue.metadata.channel.send({ embeds: [embed] }).catch(console.error);
        }
    });

    // Event: Queue ends
    player.events.on('emptyQueue', (queue) => {
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('👋 播放列表已清空')
            .setDescription('所有歌曲已播放完畢。');

        queue.metadata.channel.send({ embeds: [embed] }).catch(console.error);
    });

    // Event: Player error
    player.events.on('playerError', (queue, error) => {
        console.error(`播放器錯誤: ${error.message}`);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 播放錯誤')
            .setDescription(`播放時發生錯誤：${error.message}`);

        queue.metadata.channel.send({ embeds: [embed] }).catch(console.error);
    });

    // Event: General error
    player.events.on('error', (queue, error) => {
        console.error(`一般錯誤: ${error.message}`);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ 錯誤')
            .setDescription(`發生錯誤：${error.message}`);

        queue.metadata.channel.send({ embeds: [embed] }).catch(console.error);
    });

    console.log('🎵 音樂播放器已初始化 (使用 discord-player-youtubei)');
    console.log(`📍 FFmpeg 路徑: ${ffmpegPath}`);
}

/**
 * Get the music player instance
 * @returns {Player} The player instance
 */
function getPlayer() {
    return player;
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

/**
 * Check if bot is in the same voice channel as user
 * @param {GuildMember} member - Guild member
 * @param {Guild} guild - Guild
 * @returns {boolean} True if in same channel
 */
function isInSameVoiceChannel(member, guild) {
    const botVoiceChannel = guild.members.me?.voice?.channel;
    if (!botVoiceChannel) return false;
    return member.voice.channel?.id === botVoiceChannel.id;
}

module.exports = {
    setupMusicPlayer,
    getPlayer,
    createErrorEmbed,
    createSuccessEmbed,
    isInVoiceChannel,
    isInSameVoiceChannel
};
