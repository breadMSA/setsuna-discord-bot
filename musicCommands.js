const { EmbedBuilder } = require('discord.js');
const { QueryType } = require('discord-player');
const musicModule = require('./music.js');

/**
 * Handle music slash commands
 * @param {Interaction} interaction - Discord interaction
 */
async function handleMusicCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const player = musicModule.getPlayer();

    // Check if user is in a voice channel for commands that require it
    const requiresVoiceChannel = ['play', 'pause', 'resume', 'skip', 'stop', 'volume', 'loop', 'shuffle'];
    if (requiresVoiceChannel.includes(subcommand)) {
        if (!musicModule.isInVoiceChannel(interaction.member)) {
            return interaction.reply({
                embeds: [musicModule.createErrorEmbed('你必須先加入語音頻道才能使用此指令！')],
                ephemeral: true
            });
        }
    }

    try {
        switch (subcommand) {
            case 'play': {
                await interaction.deferReply();

                const query = interaction.options.getString('query');
                const searchResult = await player.search(query, {
                    requestedBy: interaction.user,
                    searchEngine: QueryType.AUTO
                });

                if (!searchResult || !searchResult.tracks.length) {
                    return interaction.editReply({
                        embeds: [musicModule.createErrorEmbed('找不到任何歌曲，請嘗試其他關鍵字。')]
                    });
                }

                try {
                    const queue = player.nodes.create(interaction.guild, {
                        metadata: {
                            channel: interaction.channel,
                            client: interaction.guild.members.me,
                            requestedBy: interaction.user
                        },
                        selfDeaf: true,
                        volume: 50,
                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 300000,
                        leaveOnEnd: true,
                        leaveOnEndCooldown: 300000
                    });

                    try {
                        if (!queue.connection) {
                            await queue.connect(interaction.member.voice.channel);
                        }
                    } catch {
                        queue.delete();
                        return interaction.editReply({
                            embeds: [musicModule.createErrorEmbed('無法加入語音頻道！')]
                        });
                    }

                    searchResult.playlist ? queue.addTrack(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);

                    if (!queue.isPlaying()) {
                        await queue.node.play();
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle(searchResult.playlist ? '✅ 已加入播放列表' : '✅ 已加入佇列')
                        .setDescription(searchResult.playlist
                            ? `**${searchResult.playlist.title}** (${searchResult.tracks.length} 首歌曲)`
                            : `**${searchResult.tracks[0].title}**`
                        )
                        .setThumbnail(searchResult.tracks[0].thumbnail);

                    return interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    console.error('播放錯誤:', error);
                    return interaction.editReply({
                        embeds: [musicModule.createErrorEmbed('播放時發生錯誤，請稍後再試。')]
                    });
                }
            }

            case 'pause': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue || !queue.isPlaying()) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                queue.node.pause();
                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('⏸️ 已暫停', '播放已暫停')]
                });
            }

            case 'resume': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                queue.node.resume();
                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('▶️ 已繼續', '播放已繼續')]
                });
            }

            case 'skip': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue || !queue.isPlaying()) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const currentTrack = queue.currentTrack;
                queue.node.skip();

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('⏭️ 已跳過', `已跳過 **${currentTrack.title}**`)]
                });
            }

            case 'stop': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                queue.delete();
                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('⏹️ 已停止', '已停止播放並清空佇列')]
                });
            }

            case 'queue': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue || !queue.tracks.data.length) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('播放佇列是空的！')],
                        ephemeral: true
                    });
                }

                const tracks = queue.tracks.data.slice(0, 10);
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🎵 播放佇列')
                    .setDescription(
                        `**正在播放:**\n${queue.currentTrack.title}\n\n` +
                        `**佇列中:**\n${tracks.map((track, i) => `${i + 1}. ${track.title}`).join('\n')}` +
                        (queue.tracks.data.length > 10 ? `\n\n...還有 ${queue.tracks.data.length - 10} 首歌曲` : '')
                    )
                    .setFooter({ text: `總共 ${queue.tracks.data.length} 首歌曲在佇列中` });

                return interaction.reply({ embeds: [embed] });
            }

            case 'nowplaying': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue || !queue.currentTrack) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const track = queue.currentTrack;
                const progress = queue.node.createProgressBar();

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🎵 正在播放')
                    .setDescription(`**${track.title}**`)
                    .addFields(
                        { name: '作者', value: track.author, inline: true },
                        { name: '時長', value: track.duration, inline: true },
                        { name: '點播者', value: track.requestedBy.username, inline: true },
                        { name: '進度', value: progress }
                    )
                    .setThumbnail(track.thumbnail);

                return interaction.reply({ embeds: [embed] });
            }

            case 'volume': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const volume = interaction.options.getInteger('level');
                queue.node.setVolume(volume);

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('🔊 音量已調整', `音量已設定為 ${volume}%`)]
                });
            }

            case 'loop': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const mode = interaction.options.getString('mode');
                let loopMode;
                let modeText;

                switch (mode) {
                    case 'off':
                        loopMode = 0;
                        modeText = '關閉';
                        break;
                    case 'track':
                        loopMode = 1;
                        modeText = '單曲循環';
                        break;
                    case 'queue':
                        loopMode = 2;
                        modeText = '佇列循環';
                        break;
                }

                queue.setRepeatMode(loopMode);

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('🔁 循環模式', `循環模式已設定為: ${modeText}`)]
                });
            }

            case 'shuffle': {
                const queue = player.nodes.get(interaction.guildId);
                if (!queue || !queue.tracks.data.length) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('播放佇列是空的！')],
                        ephemeral: true
                    });
                }

                queue.tracks.shuffle();

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('🔀 已隨機播放', '播放佇列已隨機排序')]
                });
            }

            default:
                return interaction.reply({
                    embeds: [musicModule.createErrorEmbed('未知的指令！')],
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('音樂指令錯誤:', error);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
                embeds: [musicModule.createErrorEmbed('執行指令時發生錯誤，請稍後再試。')]
            });
        } else {
            return interaction.reply({
                embeds: [musicModule.createErrorEmbed('執行指令時發生錯誤，請稍後再試。')],
                ephemeral: true
            });
        }
    }
}

module.exports = { handleMusicCommand };
