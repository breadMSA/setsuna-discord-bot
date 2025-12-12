/**
 * MusicPlayer.js - DisTube Music Player Integration for Setsuna
 * Handles all music playback functionality
 */

const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YouTubePlugin } = require('@distube/youtube');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Set ffmpeg path from ffmpeg-static
const ffmpegPath = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

// Format time from seconds to MM:SS or HH:MM:SS
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Parse time string (1:30, 01:30, 1:30:00) to seconds
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        return parts[0];
    }
    return 0;
}

// Create progress bar
function createProgressBar(current, total, length = 15) {
    const progress = Math.round((current / total) * length);
    const filled = '▬'.repeat(Math.max(0, progress));
    const empty = '▬'.repeat(Math.max(0, length - progress - 1));
    return `${filled}🔘${empty}`;
}

// Truncate string
function truncateString(str, maxLength = 50) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

// Loop mode names in Chinese
const loopModeNames = {
    0: '關閉',
    1: '單曲循環',
    2: '隊列循環'
};

class MusicPlayer {
    constructor(client) {
        this.client = client;

        // Initialize DisTube with plugins
        this.distube = new DisTube(client, {
            plugins: [
                new YouTubePlugin(),
                new SpotifyPlugin(),
                new SoundCloudPlugin()
            ],
            emitNewSongOnly: true,
            emitAddSongWhenCreatingQueue: false,
            emitAddListWhenCreatingQueue: false
        });

        this.setupEvents();
    }

    setupEvents() {
        // When a new song starts playing
        this.distube.on('playSong', (queue, song) => {
            const embed = this.createNowPlayingEmbed(song, queue);
            const buttons = this.createControlButtons(queue);

            queue.textChannel?.send({
                embeds: [embed],
                components: [buttons]
            }).catch(console.error);
        });

        // When a song is added to queue
        this.distube.on('addSong', (queue, song) => {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎵 已加入隊列')
                .setDescription(`**[${truncateString(song.name, 60)}](${song.url})**`)
                .addFields(
                    { name: '👤 歌手', value: song.uploader?.name || '未知', inline: true },
                    { name: '⏱️ 時長', value: formatTime(song.duration), inline: true },
                    { name: '📋 隊列位置', value: `#${queue.songs.length}`, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setFooter({ text: `由 ${song.user?.displayName || song.user?.username || '未知'} 添加` });

            queue.textChannel?.send({ embeds: [embed] }).catch(console.error);
        });

        // When a playlist is added
        this.distube.on('addList', (queue, playlist) => {
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('📋 已加入播放列表')
                .setDescription(`**${playlist.name}**`)
                .addFields(
                    { name: '🎵 歌曲數量', value: `${playlist.songs.length} 首`, inline: true },
                    { name: '⏱️ 總時長', value: formatTime(playlist.songs.reduce((acc, song) => acc + song.duration, 0)), inline: true }
                )
                .setThumbnail(playlist.thumbnail)
                .setFooter({ text: `由 ${playlist.songs[0]?.user?.displayName || '未知'} 添加` });

            queue.textChannel?.send({ embeds: [embed] }).catch(console.error);
        });

        // When queue finishes
        this.distube.on('finish', (queue) => {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('🎵 播放完畢')
                .setDescription('隊列中的所有歌曲都已播放完畢！');

            queue.textChannel?.send({ embeds: [embed] }).catch(console.error);
        });

        // When queue is empty
        this.distube.on('empty', (queue) => {
            const embed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('👋 已離開語音頻道')
                .setDescription('語音頻道已清空，再見！');

            queue.textChannel?.send({ embeds: [embed] }).catch(console.error);
        });

        // Error handling
        this.distube.on('error', (channel, error) => {
            console.error('[Music Error]', error);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ 播放錯誤')
                .setDescription(`發生錯誤: ${error.message || '未知錯誤'}`);

            if (channel) {
                channel.send({ embeds: [embed] }).catch(console.error);
            }
        });

        // No related songs for autoplay
        this.distube.on('noRelated', (queue) => {
            queue.textChannel?.send('❌ 找不到相關歌曲進行自動播放').catch(console.error);
        });

        // Search result
        this.distube.on('searchResult', (message, results) => {
            // This is handled by the search command directly
        });

        // Init queue
        this.distube.on('initQueue', (queue) => {
            queue.volume = 50;
        });
    }

    createNowPlayingEmbed(song, queue) {
        const current = queue.currentTime || 0;
        const total = song.duration || 0;
        const progressBar = createProgressBar(current, total);

        const loopMode = loopModeNames[queue.repeatMode] || '關閉';
        const isPaused = queue.paused;

        const embed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setAuthor({
                name: `🎵 正在播放`,
                iconURL: song.user?.displayAvatarURL?.()
            })
            .setTitle(truncateString(song.name, 60))
            .setURL(song.url)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: '👤 歌手', value: song.uploader?.name || '未知', inline: true },
                { name: '⏱️ 時長', value: formatTime(song.duration), inline: true },
                { name: '🔊 音量', value: `${queue.volume}%`, inline: true },
                { name: '🔁 循環模式', value: loopMode, inline: true },
                { name: '📋 隊列', value: `${queue.songs.length} 首歌`, inline: true },
                { name: '📢 請求者', value: song.user?.displayName || song.user?.username || '未知', inline: true }
            )
            .addFields({
                name: '\u200b',
                value: `${isPaused ? '⏸️' : '▶️'} ${progressBar} \`[${formatTime(current)}/${formatTime(total)}]\``,
                inline: false
            })
            .setTimestamp();

        if (queue.songs.length > 1) {
            const upNext = queue.songs.slice(1, 4).map((s, i) =>
                `\`${i + 2}.\` [${truncateString(s.name, 35)}](${s.url})`
            ).join('\n');
            embed.addFields({ name: '⏭️ 接下來', value: upNext || '沒有更多歌曲', inline: false });
        }

        return embed;
    }

    createControlButtons(queue) {
        const isPaused = queue?.paused || false;

        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('music_prev')
                    .setEmoji('⏮️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('music_pause')
                    .setEmoji(isPaused ? '▶️' : '⏸️')
                    .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('music_skip')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('music_loop')
                    .setEmoji('🔁')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    createQueueEmbed(queue, page = 1, itemsPerPage = 10) {
        const songs = queue.songs;
        const totalPages = Math.ceil((songs.length - 1) / itemsPerPage) || 1;
        page = Math.max(1, Math.min(page, totalPages));

        const start = (page - 1) * itemsPerPage + 1;
        const end = Math.min(start + itemsPerPage - 1, songs.length - 1);

        let queueList = '';
        if (songs.length > 1) {
            for (let i = start; i <= end; i++) {
                const song = songs[i];
                queueList += `\`${i}.\` [${truncateString(song.name, 40)}](${song.url}) - \`${formatTime(song.duration)}\`\n`;
            }
        }

        const currentSong = songs[0];
        const totalDuration = songs.reduce((acc, song) => acc + song.duration, 0);

        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle('🎵 音樂隊列')
            .setDescription(`**正在播放:**\n[${truncateString(currentSong.name, 50)}](${currentSong.url}) - \`${formatTime(currentSong.duration)}\``)
            .addFields({
                name: `📋 隊列 (${songs.length - 1} 首歌)`,
                value: queueList || '隊列中沒有其他歌曲',
                inline: false
            })
            .setFooter({
                text: `第 ${page}/${totalPages} 頁 | 總時長: ${formatTime(totalDuration)} | 循環: ${loopModeNames[queue.repeatMode]}`
            });

        return embed;
    }

    // Get queue for a guild
    getQueue(guildId) {
        return this.distube.getQueue(guildId);
    }

    // Play a song
    async play(voiceChannel, textChannel, query, member) {
        try {
            await this.distube.play(voiceChannel, query, {
                member: member,
                textChannel: textChannel
            });
            return { success: true };
        } catch (error) {
            console.error('[Music Play Error]', error);
            return { success: false, error: error.message };
        }
    }

    // Pause playback
    pause(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };
        if (queue.paused) return { success: false, error: '音樂已經暫停了' };

        queue.pause();
        return { success: true };
    }

    // Resume playback
    resume(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };
        if (!queue.paused) return { success: false, error: '音樂正在播放中' };

        queue.resume();
        return { success: true };
    }

    // Skip to next song
    async skip(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        try {
            if (queue.songs.length <= 1) {
                await queue.stop();
                return { success: true, message: '隊列已清空，停止播放' };
            }
            await queue.skip();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Skip to specific position
    async skipTo(guildId, position) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };
        if (position < 1 || position >= queue.songs.length) {
            return { success: false, error: '無效的位置' };
        }

        try {
            await queue.jump(position);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Stop and leave
    async stop(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        try {
            await queue.stop();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Set volume
    setVolume(guildId, volume) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        volume = Math.max(0, Math.min(150, volume));
        queue.setVolume(volume);
        return { success: true, volume: volume };
    }

    // Seek to position
    seek(guildId, seconds) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        try {
            queue.seek(seconds);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Shuffle queue
    shuffle(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };
        if (queue.songs.length <= 2) return { success: false, error: '隊列中歌曲不足，無法隨機播放' };

        queue.shuffle();
        return { success: true };
    }

    // Set loop mode (0: off, 1: song, 2: queue)
    setLoop(guildId, mode) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        queue.setRepeatMode(mode);
        return { success: true, mode: loopModeNames[mode] };
    }

    // Toggle loop to next mode
    toggleLoop(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        const newMode = (queue.repeatMode + 1) % 3;
        queue.setRepeatMode(newMode);
        return { success: true, mode: loopModeNames[newMode] };
    }

    // Remove song from queue
    remove(guildId, position) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };
        if (position < 1 || position >= queue.songs.length) {
            return { success: false, error: '無效的位置' };
        }

        const removed = queue.songs.splice(position, 1)[0];
        return { success: true, song: removed };
    }

    // Move song in queue
    move(guildId, from, to) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };
        if (from < 1 || from >= queue.songs.length || to < 1 || to >= queue.songs.length) {
            return { success: false, error: '無效的位置' };
        }

        const song = queue.songs.splice(from, 1)[0];
        queue.songs.splice(to, 0, song);
        return { success: true, song: song };
    }

    // Clear queue (keep current song)
    clear(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        const currentSong = queue.songs[0];
        queue.songs.length = 1;
        return { success: true };
    }

    // Apply filter
    async setFilter(guildId, filterName) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        try {
            if (filterName === 'off' || filterName === '關閉') {
                await queue.filters.clear();
                return { success: true, message: '已關閉所有濾鏡' };
            }

            // Available filters
            const filters = {
                'bassboost': 'bassboost',
                '重低音': 'bassboost',
                'nightcore': 'nightcore',
                '夜核': 'nightcore',
                'vaporwave': 'vaporwave',
                '蒸汽波': 'vaporwave',
                '3d': '3d',
                'echo': 'echo',
                '回音': 'echo',
                'karaoke': 'karaoke',
                '卡拉OK': 'karaoke',
                'flanger': 'flanger',
                'gate': 'gate',
                'haas': 'haas',
                'reverse': 'reverse',
                '反轉': 'reverse',
                'surround': 'surround',
                '環繞': 'surround',
                'mcompand': 'mcompand',
                'phaser': 'phaser',
                'tremolo': 'tremolo',
                'earwax': 'earwax'
            };

            const filter = filters[filterName.toLowerCase()];
            if (!filter) {
                return {
                    success: false,
                    error: `未知的濾鏡。可用濾鏡: ${Object.keys(filters).filter(k => !k.includes('中文')).join(', ')}`
                };
            }

            if (queue.filters.has(filter)) {
                await queue.filters.remove(filter);
                return { success: true, message: `已關閉 ${filter} 濾鏡` };
            } else {
                await queue.filters.add(filter);
                return { success: true, message: `已啟用 ${filter} 濾鏡` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get current filters
    getFilters(guildId) {
        const queue = this.getQueue(guildId);
        if (!queue) return [];
        return queue.filters.names;
    }

    // Replay current song
    replay(guildId) {
        return this.seek(guildId, 0);
    }

    // Forward by seconds
    forward(guildId, seconds = 10) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        const newTime = Math.min(queue.currentTime + seconds, queue.songs[0].duration - 1);
        return this.seek(guildId, newTime);
    }

    // Rewind by seconds
    rewind(guildId, seconds = 10) {
        const queue = this.getQueue(guildId);
        if (!queue) return { success: false, error: '沒有正在播放的音樂' };

        const newTime = Math.max(queue.currentTime - seconds, 0);
        return this.seek(guildId, newTime);
    }

    // Handle button interactions
    async handleButton(interaction) {
        const guildId = interaction.guildId;
        const customId = interaction.customId;

        if (!customId.startsWith('music_')) return false;

        const member = interaction.member;
        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {
            await interaction.reply({ content: '❌ 你需要在語音頻道中才能使用這個功能！', ephemeral: true });
            return true;
        }

        const queue = this.getQueue(guildId);
        if (!queue) {
            await interaction.reply({ content: '❌ 目前沒有在播放音樂！', ephemeral: true });
            return true;
        }

        let result;
        let message = '';

        switch (customId) {
            case 'music_prev':
                if (queue.previousSongs.length > 0) {
                    await queue.previous();
                    message = '⏮️ 播放上一首';
                } else {
                    result = this.seek(guildId, 0);
                    message = result.success ? '⏮️ 已重新開始播放' : result.error;
                }
                break;

            case 'music_pause':
                if (queue.paused) {
                    result = this.resume(guildId);
                    message = result.success ? '▶️ 已繼續播放' : result.error;
                } else {
                    result = this.pause(guildId);
                    message = result.success ? '⏸️ 已暫停' : result.error;
                }
                break;

            case 'music_skip':
                result = await this.skip(guildId);
                message = result.success ? (result.message || '⏭️ 已跳過') : result.error;
                break;

            case 'music_stop':
                result = await this.stop(guildId);
                message = result.success ? '⏹️ 已停止播放' : result.error;
                break;

            case 'music_loop':
                result = this.toggleLoop(guildId);
                message = result.success ? `🔁 循環模式: ${result.mode}` : result.error;
                break;

            default:
                return false;
        }

        await interaction.reply({ content: message, ephemeral: true });

        // Update the original message buttons if queue still exists
        if (customId !== 'music_stop') {
            const newQueue = this.getQueue(guildId);
            if (newQueue) {
                try {
                    await interaction.message.edit({
                        components: [this.createControlButtons(newQueue)]
                    });
                } catch (e) {
                    // Message might be deleted or not editable
                }
            }
        }

        return true;
    }
}

// Export utilities
module.exports = {
    MusicPlayer,
    formatTime,
    parseTime,
    createProgressBar,
    truncateString,
    loopModeNames
};
