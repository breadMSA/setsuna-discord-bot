const { EmbedBuilder } = require('discord.js');
const musicModule = require('./music.js');

/**
 * Handle music slash commands
 * @param {Interaction} interaction - Discord interaction
 */
async function handleMusicCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const kazagumo = musicModule.getPlayer();

    if (!kazagumo) {
        return interaction.reply({
            embeds: [musicModule.createErrorEmbed('音樂播放器尚未初始化！')],
            ephemeral: true
        });
    }

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

                // Get or create player
                let player = kazagumo.players.get(interaction.guildId);

                if (!player) {
                    player = await kazagumo.createPlayer({
                        guildId: interaction.guildId,
                        textId: interaction.channelId,
                        voiceId: interaction.member.voice.channel.id,
                        volume: 50,
                        deaf: true
                    });
                }

                // Search for tracks
                const result = await kazagumo.search(query, { requester: interaction.user });

                if (!result.tracks.length) {
                    return interaction.editReply({
                        embeds: [musicModule.createErrorEmbed('找不到任何歌曲，請嘗試其他關鍵字。')]
                    });
                }

                if (result.type === 'PLAYLIST') {
                    for (const track of result.tracks) {
                        player.queue.add(track);
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('✅ 已加入播放列表')
                        .setDescription(`**${result.playlistName}** (${result.tracks.length} 首歌曲)`);

                    await interaction.editReply({ embeds: [embed] });
                } else {
                    player.queue.add(result.tracks[0]);

                    if (player.playing || player.queue.current) {
                        const embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('✅ 已加入佇列')
                            .setDescription(`**${result.tracks[0].title}**`)
                            .setThumbnail(result.tracks[0].thumbnail);

                        await interaction.editReply({ embeds: [embed] });
                    } else {
                        await interaction.editReply({
                            embeds: [musicModule.createSuccessEmbed('🎵 正在準備播放...', `**${result.tracks[0].title}**`)]
                        });
                    }
                }

                if (!player.playing && !player.paused) {
                    player.play();
                }

                break;
            }

            case 'pause': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player || !player.queue.current) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                player.pause(true);
                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('⏸️ 已暫停', '播放已暫停')]
                });
            }

            case 'resume': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                player.pause(false);
                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('▶️ 已繼續', '播放已繼續')]
                });
            }

            case 'skip': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player || !player.queue.current) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const currentTrack = player.queue.current;
                player.skip();

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('⏭️ 已跳過', `已跳過 **${currentTrack.title}**`)]
                });
            }

            case 'stop': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                player.destroy();
                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('⏹️ 已停止', '已停止播放並清空佇列')]
                });
            }

            case 'queue': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player || !player.queue.current) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('播放佇列是空的！')],
                        ephemeral: true
                    });
                }

                const tracks = player.queue.slice(0, 10);
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🎵 播放佇列')
                    .setDescription(
                        `**正在播放:**\n${player.queue.current.title}\n\n` +
                        (tracks.length > 0
                            ? `**佇列中:**\n${tracks.map((track, i) => `${i + 1}. ${track.title}`).join('\n')}`
                            : '佇列中沒有其他歌曲') +
                        (player.queue.length > 10 ? `\n\n...還有 ${player.queue.length - 10} 首歌曲` : '')
                    )
                    .setFooter({ text: `總共 ${player.queue.length} 首歌曲在佇列中` });

                return interaction.reply({ embeds: [embed] });
            }

            case 'nowplaying': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player || !player.queue.current) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const track = player.queue.current;
                const position = player.position;
                const duration = track.length;
                const progress = Math.round((position / duration) * 20);
                const progressBar = '▓'.repeat(progress) + '░'.repeat(20 - progress);

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🎵 正在播放')
                    .setDescription(`**${track.title}**`)
                    .addFields(
                        { name: '作者', value: track.author || '未知', inline: true },
                        { name: '時長', value: musicModule.formatDuration(duration), inline: true },
                        { name: '點播者', value: track.requester?.username || '未知', inline: true },
                        { name: '進度', value: `${progressBar}\n${musicModule.formatDuration(position)} / ${musicModule.formatDuration(duration)}` }
                    )
                    .setThumbnail(track.thumbnail);

                return interaction.reply({ embeds: [embed] });
            }

            case 'volume': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('目前沒有正在播放的歌曲！')],
                        ephemeral: true
                    });
                }

                const volume = interaction.options.getInteger('level');
                player.setVolume(volume);

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('🔊 音量已調整', `音量已設定為 ${volume}%`)]
                });
            }

            case 'loop': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player) {
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
                        loopMode = 'none';
                        modeText = '關閉';
                        break;
                    case 'track':
                        loopMode = 'track';
                        modeText = '單曲循環';
                        break;
                    case 'queue':
                        loopMode = 'queue';
                        modeText = '佇列循環';
                        break;
                }

                player.setLoop(loopMode);

                return interaction.reply({
                    embeds: [musicModule.createSuccessEmbed('🔁 循環模式', `循環模式已設定為: ${modeText}`)]
                });
            }

            case 'shuffle': {
                const player = kazagumo.players.get(interaction.guildId);
                if (!player || player.queue.length < 2) {
                    return interaction.reply({
                        embeds: [musicModule.createErrorEmbed('播放佇列中需要至少 2 首歌曲才能隨機播放！')],
                        ephemeral: true
                    });
                }

                player.queue.shuffle();

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

        const errorEmbed = musicModule.createErrorEmbed(`執行指令時發生錯誤：${error.message || '未知錯誤'}`);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ embeds: [errorEmbed] });
        } else {
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

module.exports = { handleMusicCommand };
