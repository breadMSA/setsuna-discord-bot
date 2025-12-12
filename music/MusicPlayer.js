/**
 * MusicPlayer.js - Riffy Lavalink Music Player for Setsuna
 * Uses Lavalink server for reliable YouTube/Spotify/SoundCloud playback
 */

const { Riffy } = require('riffy');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayDispatchEvents } = require('discord.js');

// Format time from milliseconds to MM:SS or HH:MM:SS
function formatTime(ms) {
    if (!ms || isNaN(ms)) return '00:00';
    const seconds = Math.floor(ms / 1000);
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Parse time string (1:30, 01:30, 1:30:00) to milliseconds
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.some(isNaN)) return 0;

    let seconds = 0;
    if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        seconds = parts[0];
    }
    return seconds * 1000;
}

// Create progress bar
function createProgressBar(current, total, length = 15) {
    if (!total || total === 0) return '▬'.repeat(length);
    const progress = Math.round((current / total) * length);
    const filled = '▬'.repeat(Math.max(0, Math.min(progress, length - 1)));
    const empty = '▬'.repeat(Math.max(0, length - progress - 1));
    return `${filled}🔘${empty}`;
}

// Truncate string
function truncateString(str, maxLength = 50) {
    if (!str) return '未知';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

// Loop mode names in Chinese
const loopModeNames = {
    'none': '關閉',
    'track': '單曲循環',
    'queue': '隊列循環'
};

// Free Lavalink nodes (multiple regions for redundancy)
const lavalinkNodes = [
    {
        name: 'Singapore',
        host: 'lava1.horizxon.studio',
        port: 80,
        password: 'horizxon.studio',
        secure: false
    },
    {
        name: 'US-California',
        host: 'lava2.horizxon.studio',
        port: 80,
        password: 'horizxon.studio',
        secure: false
    },
    {
        name: 'Germany',
        host: 'lava3.horizxon.studio',
        port: 80,
        password: 'horizxon.studio',
        secure: false
    }
];

class MusicPlayer {
    constructor(client) {
        this.client = client;

        // Initialize Riffy with Lavalink nodes
        this.riffy = new Riffy(client, lavalinkNodes, {
            send: (payload) => {
                const guild = client.guilds.cache.get(payload.d.guild_id);
                if (guild) guild.shard.send(payload);
            },
            defaultSearchPlatform: 'ytmsearch', // YouTube Music search
            restVersion: 'v4'
        });

        this.setupEvents();
        this.setupVoiceStateUpdate();
    }

    // Initialize after client is ready
    init(clientId) {
        this.riffy.init(clientId);
    }

    setupVoiceStateUpdate() {
        // Handle voice state updates
        this.client.on('raw', (d) => {
            if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
            this.riffy.updateVoiceState(d);
        });
    }

    setupEvents() {
        // Node connected
        this.riffy.on('nodeConnect', (node) => {
            console.log(`[Music] Lavalink node "${node.name}" connected.`);
        });

        // Node error
        this.riffy.on('nodeError', (node, error) => {
            console.error(`[Music] Lavalink node "${node.name}" error:`, error.message);
        });

        // Node disconnect
        this.riffy.on('nodeDisconnect', (node) => {
            console.log(`[Music] Lavalink node "${node.name}" disconnected.`);
        });

        // Track start
        this.riffy.on('trackStart', async (player, track) => {
            const channel = this.client.channels.cache.get(player.textChannel);
            if (!channel) return;

            const embed = this.createNowPlayingEmbed(track, player);
            const buttons = this.createControlButtons(player);

            try {
                await channel.send({ embeds: [embed], components: [buttons] });
            } catch (e) {
                console.error('[Music] Error sending now playing message:', e.message);
            }
        });

        // Queue end
        this.riffy.on('queueEnd', async (player) => {
            const channel = this.client.channels.cache.get(player.textChannel);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('🎵 播放完畢')
                .setDescription('隊列中的所有歌曲都已播放完畢！');

            try {
                await channel.send({ embeds: [embed] });
                player.destroy();
            } catch (e) {
                console.error('[Music] Error sending queue end message:', e.message);
            }
        });

        // Player disconnect
        this.riffy.on('playerDisconnect', async (player) => {
            const channel = this.client.channels.cache.get(player.textChannel);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('👋 已離開語音頻道')
                    .setDescription('再見！');
                await channel.send({ embeds: [embed] }).catch(() => { });
            }
        });

        // Track error
        this.riffy.on('trackError', async (player, track, error) => {
            console.error('[Music] Track error:', error);
            const channel = this.client.channels.cache.get(player.textChannel);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ 播放錯誤')
                    .setDescription(`無法播放 **${track.info.title}**\n錯誤: ${error.message || '未知錯誤'}`);
                await channel.send({ embeds: [embed] }).catch(() => { });
            }
        });
    }

    createNowPlayingEmbed(track, player) {
        const info = track.info;
        const current = player.position || 0;
        const total = info.length || 0;
        const progressBar = createProgressBar(current, total);

        const loopMode = loopModeNames[player.loop] || '關閉';
        const isPaused = player.paused;

        const embed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setAuthor({ name: '🎵 正在播放' })
            .setTitle(truncateString(info.title, 60))
            .setURL(info.uri)
            .setThumbnail(info.artworkUrl || null)
            .addFields(
                { name: '👤 歌手', value: truncateString(info.author, 30), inline: true },
                { name: '⏱️ 時長', value: info.isStream ? '🔴 直播' : formatTime(info.length), inline: true },
                { name: '🔊 音量', value: `${player.volume}%`, inline: true },
                { name: '🔁 循環模式', value: loopMode, inline: true },
                { name: '📋 隊列', value: `${player.queue.length + 1} 首歌`, inline: true },
                { name: '📢 請求者', value: info.requester?.displayName || info.requester?.username || '未知', inline: true }
            )
            .addFields({
                name: '\u200b',
                value: `${isPaused ? '⏸️' : '▶️'} ${progressBar} \`[${formatTime(current)}/${formatTime(total)}]\``,
                inline: false
            })
            .setTimestamp();

        if (player.queue.length > 0) {
            const upNext = player.queue.slice(0, 3).map((t, i) =>
                `\`${i + 2}.\` [${truncateString(t.info.title, 35)}](${t.info.uri})`
            ).join('\n');
            embed.addFields({ name: '⏭️ 接下來', value: upNext, inline: false });
        }

        return embed;
    }

    createControlButtons(player) {
        const isPaused = player?.paused || false;

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

    createQueueEmbed(player, page = 1, itemsPerPage = 10) {
        const queue = player.queue;
        const currentTrack = player.current;
        const totalPages = Math.ceil(queue.length / itemsPerPage) || 1;
        page = Math.max(1, Math.min(page, totalPages));

        const start = (page - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, queue.length);

        let queueList = '';
        for (let i = start; i < end; i++) {
            const track = queue[i];
            queueList += `\`${i + 2}.\` [${truncateString(track.info.title, 40)}](${track.info.uri}) - \`${formatTime(track.info.length)}\`\n`;
        }

        const totalDuration = queue.reduce((acc, t) => acc + (t.info.length || 0), currentTrack?.info?.length || 0);

        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle('🎵 音樂隊列')
            .setDescription(`**正在播放:**\n[${truncateString(currentTrack?.info?.title, 50)}](${currentTrack?.info?.uri}) - \`${formatTime(currentTrack?.info?.length)}\``)
            .addFields({
                name: `📋 隊列 (${queue.length} 首歌)`,
                value: queueList || '隊列中沒有其他歌曲',
                inline: false
            })
            .setFooter({
                text: `第 ${page}/${totalPages} 頁 | 總時長: ${formatTime(totalDuration)} | 循環: ${loopModeNames[player.loop] || '關閉'}`
            });

        return embed;
    }

    // Get player for a guild
    getPlayer(guildId) {
        return this.riffy.players.get(guildId);
    }

    // Play a song
    async play(voiceChannel, textChannel, query, member) {
        try {
            // Create or get player
            let player = this.getPlayer(voiceChannel.guild.id);

            if (!player) {
                player = this.riffy.createConnection({
                    guildId: voiceChannel.guild.id,
                    voiceChannel: voiceChannel.id,
                    textChannel: textChannel.id,
                    deaf: true
                });
            }

            // Search for the track
            const resolve = await this.riffy.resolve({
                query: query,
                requester: member
            });

            const { loadType, tracks, playlistInfo } = resolve;

            if (loadType === 'empty' || loadType === 'error' || !tracks || tracks.length === 0) {
                return { success: false, error: '找不到任何結果' };
            }

            if (loadType === 'playlist') {
                for (const track of tracks) {
                    track.info.requester = member;
                    player.queue.add(track);
                }

                if (!player.playing && !player.paused) {
                    player.play();
                }

                return {
                    success: true,
                    type: 'playlist',
                    name: playlistInfo.name,
                    count: tracks.length
                };
            } else {
                const track = tracks[0];
                track.info.requester = member;
                player.queue.add(track);

                if (!player.playing && !player.paused) {
                    player.play();
                }

                return {
                    success: true,
                    type: 'track',
                    track: track
                };
            }
        } catch (error) {
            console.error('[Music Play Error]', error);
            return { success: false, error: error.message };
        }
    }

    // Pause playback
    pause(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };
        if (player.paused) return { success: false, error: '音樂已經暫停了' };

        player.pause(true);
        return { success: true };
    }

    // Resume playback
    resume(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };
        if (!player.paused) return { success: false, error: '音樂正在播放中' };

        player.pause(false);
        return { success: true };
    }

    // Skip to next song
    skip(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        if (player.queue.length === 0) {
            player.stop();
            return { success: true, message: '隊列已清空，停止播放' };
        }

        player.stop();
        return { success: true };
    }

    // Stop and leave
    stop(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        player.destroy();
        return { success: true };
    }

    // Set volume (0-200)
    setVolume(guildId, volume) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        volume = Math.max(0, Math.min(200, volume));
        player.setVolume(volume);
        return { success: true, volume: volume };
    }

    // Seek to position (milliseconds)
    seek(guildId, ms) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };
        if (!player.current) return { success: false, error: '沒有正在播放的歌曲' };

        player.seek(ms);
        return { success: true };
    }

    // Shuffle queue
    shuffle(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };
        if (player.queue.length < 2) return { success: false, error: '隊列中歌曲不足，無法隨機播放' };

        player.queue.shuffle();
        return { success: true };
    }

    // Set loop mode ('none', 'track', 'queue')
    setLoop(guildId, mode) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        player.setLoop(mode);
        return { success: true, mode: loopModeNames[mode] || mode };
    }

    // Toggle loop to next mode
    toggleLoop(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        const modes = ['none', 'track', 'queue'];
        const currentIndex = modes.indexOf(player.loop);
        const newMode = modes[(currentIndex + 1) % 3];

        player.setLoop(newMode);
        return { success: true, mode: loopModeNames[newMode] };
    }

    // Remove song from queue
    remove(guildId, position) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };
        if (position < 1 || position > player.queue.length) {
            return { success: false, error: '無效的位置' };
        }

        const removed = player.queue.remove(position - 1);
        return { success: true, track: removed };
    }

    // Clear queue (keep current song)
    clear(guildId) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        player.queue.clear();
        return { success: true };
    }

    // Apply filter
    async setFilter(guildId, filterName) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        try {
            const filters = {
                'off': null,
                '關閉': null,
                'bassboost': { equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.7 }, { band: 2, gain: 0.8 }] },
                '重低音': { equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.7 }, { band: 2, gain: 0.8 }] },
                'nightcore': { timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 } },
                '夜核': { timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 } },
                'vaporwave': { timescale: { speed: 0.85, pitch: 0.9, rate: 1.0 } },
                '蒸汽波': { timescale: { speed: 0.85, pitch: 0.9, rate: 1.0 } },
                'karaoke': { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
                '卡拉OK': { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
                'tremolo': { tremolo: { frequency: 4.0, depth: 0.75 } },
                'vibrato': { vibrato: { frequency: 4.0, depth: 0.75 } },
                '8d': { rotation: { rotationHz: 0.2 } }
            };

            const filter = filters[filterName.toLowerCase()];
            if (filter === undefined) {
                return {
                    success: false,
                    error: `未知的濾鏡。可用濾鏡: off, bassboost, nightcore, vaporwave, karaoke, tremolo, vibrato, 8d`
                };
            }

            if (filter === null) {
                await player.node.rest.updatePlayer({
                    guildId: guildId,
                    data: { filters: {} }
                });
                return { success: true, message: '已關閉所有濾鏡' };
            } else {
                await player.node.rest.updatePlayer({
                    guildId: guildId,
                    data: { filters: filter }
                });
                return { success: true, message: `已啟用 ${filterName} 濾鏡` };
            }
        } catch (error) {
            console.error('[Music Filter Error]', error);
            return { success: false, error: error.message };
        }
    }

    // Replay current song
    replay(guildId) {
        return this.seek(guildId, 0);
    }

    // Forward by seconds
    forward(guildId, seconds = 10) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };
        if (!player.current) return { success: false, error: '沒有正在播放的歌曲' };

        const newTime = Math.min(player.position + (seconds * 1000), player.current.info.length - 1000);
        return this.seek(guildId, newTime);
    }

    // Rewind by seconds
    rewind(guildId, seconds = 10) {
        const player = this.getPlayer(guildId);
        if (!player) return { success: false, error: '沒有正在播放的音樂' };

        const newTime = Math.max(player.position - (seconds * 1000), 0);
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

        const player = this.getPlayer(guildId);
        if (!player) {
            await interaction.reply({ content: '❌ 目前沒有在播放音樂！', ephemeral: true });
            return true;
        }

        let result;
        let message = '';

        switch (customId) {
            case 'music_prev':
                result = this.seek(guildId, 0);
                message = result.success ? '⏮️ 已重新開始播放' : result.error;
                break;

            case 'music_pause':
                if (player.paused) {
                    result = this.resume(guildId);
                    message = result.success ? '▶️ 已繼續播放' : result.error;
                } else {
                    result = this.pause(guildId);
                    message = result.success ? '⏸️ 已暫停' : result.error;
                }
                break;

            case 'music_skip':
                result = this.skip(guildId);
                message = result.success ? (result.message || '⏭️ 已跳過') : result.error;
                break;

            case 'music_stop':
                result = this.stop(guildId);
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

        // Update the original message buttons if player still exists
        if (customId !== 'music_stop') {
            const currentPlayer = this.getPlayer(guildId);
            if (currentPlayer) {
                try {
                    await interaction.message.edit({
                        components: [this.createControlButtons(currentPlayer)]
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
