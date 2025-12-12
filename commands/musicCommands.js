/**
 * musicCommands.js - Music Slash Commands for Setsuna
 * Defines all music-related slash commands
 */

const { SlashCommandBuilder } = require('discord.js');

// Available audio filters for the filter command
const filterChoices = [
    { name: '關閉濾鏡', value: 'off' },
    { name: '🔊 重低音 (Bassboost)', value: 'bassboost' },
    { name: '🌙 夜核 (Nightcore)', value: 'nightcore' },
    { name: '🌊 蒸汽波 (Vaporwave)', value: 'vaporwave' },
    { name: '🎤 卡拉OK (Karaoke)', value: 'karaoke' },
    { name: '🔉 回音 (Echo)', value: 'echo' },
    { name: '🎧 3D 效果', value: '3d' },
    { name: '🔄 環繞音效 (Surround)', value: 'surround' },
    { name: '⏪ 反轉 (Reverse)', value: 'reverse' },
    { name: '🎵 Flanger', value: 'flanger' },
    { name: '🎶 Phaser', value: 'phaser' },
    { name: '〰️ Tremolo', value: 'tremolo' }
];

// Build the music command with subcommands
const musicCommand = new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎵 音樂播放控制')

    // Play command
    .addSubcommand(subcommand =>
        subcommand
            .setName('play')
            .setDescription('播放音樂 - 支援 YouTube、Spotify、SoundCloud')
            .addStringOption(option =>
                option
                    .setName('query')
                    .setDescription('歌曲名稱、網址或播放列表連結')
                    .setRequired(true)
            )
    )

    // Pause command
    .addSubcommand(subcommand =>
        subcommand
            .setName('pause')
            .setDescription('暫停播放')
    )

    // Resume command
    .addSubcommand(subcommand =>
        subcommand
            .setName('resume')
            .setDescription('繼續播放')
    )

    // Skip command
    .addSubcommand(subcommand =>
        subcommand
            .setName('skip')
            .setDescription('跳過當前歌曲')
            .addIntegerOption(option =>
                option
                    .setName('to')
                    .setDescription('跳到隊列中的特定位置')
                    .setRequired(false)
                    .setMinValue(1)
            )
    )

    // Stop command
    .addSubcommand(subcommand =>
        subcommand
            .setName('stop')
            .setDescription('停止播放並離開語音頻道')
    )

    // Queue command
    .addSubcommand(subcommand =>
        subcommand
            .setName('queue')
            .setDescription('顯示播放隊列')
            .addIntegerOption(option =>
                option
                    .setName('page')
                    .setDescription('頁碼')
                    .setRequired(false)
                    .setMinValue(1)
            )
    )

    // Now playing command
    .addSubcommand(subcommand =>
        subcommand
            .setName('nowplaying')
            .setDescription('顯示正在播放的歌曲')
    )

    // Shuffle command
    .addSubcommand(subcommand =>
        subcommand
            .setName('shuffle')
            .setDescription('隨機打亂隊列順序')
    )

    // Loop command
    .addSubcommand(subcommand =>
        subcommand
            .setName('loop')
            .setDescription('設定循環模式')
            .addStringOption(option =>
                option
                    .setName('mode')
                    .setDescription('循環模式')
                    .setRequired(true)
                    .addChoices(
                        { name: '🔄 關閉', value: 'off' },
                        { name: '🔂 單曲循環', value: 'song' },
                        { name: '🔁 隊列循環', value: 'queue' }
                    )
            )
    )

    // Volume command
    .addSubcommand(subcommand =>
        subcommand
            .setName('volume')
            .setDescription('調整音量')
            .addIntegerOption(option =>
                option
                    .setName('level')
                    .setDescription('音量 (0-150)')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(150)
            )
    )

    // Seek command
    .addSubcommand(subcommand =>
        subcommand
            .setName('seek')
            .setDescription('跳轉到指定時間')
            .addStringOption(option =>
                option
                    .setName('time')
                    .setDescription('時間格式: 1:30 或 01:30 或 90')
                    .setRequired(true)
            )
    )

    // Remove command
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('從隊列中移除歌曲')
            .addIntegerOption(option =>
                option
                    .setName('position')
                    .setDescription('歌曲在隊列中的位置')
                    .setRequired(true)
                    .setMinValue(1)
            )
    )

    // Move command
    .addSubcommand(subcommand =>
        subcommand
            .setName('move')
            .setDescription('移動隊列中歌曲的位置')
            .addIntegerOption(option =>
                option
                    .setName('from')
                    .setDescription('原始位置')
                    .setRequired(true)
                    .setMinValue(1)
            )
            .addIntegerOption(option =>
                option
                    .setName('to')
                    .setDescription('目標位置')
                    .setRequired(true)
                    .setMinValue(1)
            )
    )

    // Clear command
    .addSubcommand(subcommand =>
        subcommand
            .setName('clear')
            .setDescription('清空隊列 (保留正在播放的歌曲)')
    )

    // Filter command
    .addSubcommand(subcommand =>
        subcommand
            .setName('filter')
            .setDescription('套用音效濾鏡')
            .addStringOption(option =>
                option
                    .setName('name')
                    .setDescription('濾鏡名稱')
                    .setRequired(true)
                    .addChoices(...filterChoices)
            )
    )

    // Replay command
    .addSubcommand(subcommand =>
        subcommand
            .setName('replay')
            .setDescription('重新播放當前歌曲')
    )

    // Forward command
    .addSubcommand(subcommand =>
        subcommand
            .setName('forward')
            .setDescription('快進')
            .addIntegerOption(option =>
                option
                    .setName('seconds')
                    .setDescription('秒數 (預設: 10 秒)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(300)
            )
    )

    // Rewind command
    .addSubcommand(subcommand =>
        subcommand
            .setName('rewind')
            .setDescription('倒退')
            .addIntegerOption(option =>
                option
                    .setName('seconds')
                    .setDescription('秒數 (預設: 10 秒)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(300)
            )
    );

module.exports = {
    musicCommand,
    filterChoices
};
