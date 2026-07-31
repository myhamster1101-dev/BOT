const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// ดึงค่าจาก Environment Variables ใน Railway
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // **อย่าลืมเพิ่มตัวแปรนี้ใน Railway (Application ID ของบอท)**
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;

// --------------------------------------------------
// 1. ลงทะเบียน Slash Commands ( / )
// --------------------------------------------------
const commands = [
    // คำสั่งสร้างเมนูผู้ใช้พร้อมปุ่มกด
    new SlashCommandBuilder()
        .setName('setup-menu')
        .setDescription('สร้างเมนูศูนย์ช่วยเหลือพร้อมปุ่มกด')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('title')
                .setDescription('หัวข้อของ Embed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('รายละเอียดข้อความ')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('ลิงก์รูป Banner (ถ้ามี)')
                .setRequired(false)),

    // คำสั่งแอดมินจัดการสมาชิก
    new SlashCommandBuilder()
        .setName('action')
        .setDescription('จัดการสมาชิก (Blacklist / Ban / Report)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('เลือกผู้ใช้ที่ต้องการจัดการ')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('ระบุเหตุผล')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้วในชื่อ: ${client.user.tag}`);
    
    // Register Slash Commands แบบ Global
    try {
        console.log('⏳ กำลังอัปเดต Slash Commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('✅ ลงทะเบียน Slash Commands สำเร็จแล้ว!');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียน Slash Commands:', error);
    }
});

// --------------------------------------------------
// 2. ประมวลผลคำสั่ง Slash Commands
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- คำสั่ง /setup-menu ---
    if (commandName === 'setup-menu') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const imageUrl = interaction.options.getString('image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x0099FF)
            .setTimestamp();

        if (imageUrl) embed.setImage(imageUrl);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_user_report')
                .setLabel('🚨 แจ้งปัญหา / รายงาน')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('btn_user_suggest')
                .setLabel('💡 ข้อเสนอแนะ')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างเมนูเรียบร้อยแล้ว!', ephemeral: true });
    }

    // --- คำสั่ง /action ---
    if (commandName === 'action') {
        if (ADMIN_CHANNEL_ID && interaction.channelId !== ADMIN_CHANNEL_ID) {
            return interaction.reply({ content: '❌ สามารถใช้คำสั่งนี้ได้ในห้องแอดมินเท่านั้น!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_${targetUser.id}_${encodeURIComponent(reason)}`)
            .setPlaceholder('เลือกรายการดำเนินการ...')
            .addOptions([
                {
                    label: '⛔ ลงบัญชีดำ (Blacklist)',
                    description: 'ประกาศรายชื่อลงช่องบัญชีดำทันที',
                    value: 'type_blacklist',
                },
                {
                    label: '🔨 ลงโทษแบน / Mute (Ban/Timeout)',
                    description: 'เลือกระยะเวลาการแบน หรือห้ามพิมพ์/ห้ามเปิดไมค์',
                    value: 'type_ban',
                },
                {
                    label: '📩 แจ้งเตือนข้อผิดพลาด (Report/DM)',
                    description: 'ส่ง DM หาผู้ใช้ และบันทึกลงห้องกระทำผิด',
                    value: 'type_report',
                },
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ 
            content: `🎯 **จัดการผู้ใช้:** <@${targetUser.id}>\n📝 **เหตุผล:** ${reason}`, 
            components: [row] 
        });
    }
});

// --------------------------------------------------
// 3. ประมวลผล Dropdown & Buttons
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    // --- จัดการ Dropdown Menu ของแอดมิน ---
    if (interaction.isStringSelectMenu()) {

        // เมนูหลัก
        if (interaction.customId.startsWith('admin_select_')) {
            const [, , targetId, encodedReason] = interaction.customId.split('_');
            const reason = decodeURIComponent(encodedReason);
            const selectedValue = interaction.values[0];
            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

            if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

            // 1. บัญชีดำ (Blacklist)
            if (selectedValue === 'type_blacklist') {
                const blacklistChannel = interaction.guild.channels.cache.get(BLACKLIST_CHANNEL_ID);
                
                const blacklistEmbed = new EmbedBuilder()
                    .setTitle('⛔ ประกาศรายชื่อบัญชีดำ (Blacklist)')
                    .setColor(0x000000)
                    .addFields(
                        { name: 'ผู้ถูกบันทึก', value: `${targetMember.user.tag} (${targetMember.id})` },
                        { name: 'เหตุผล', value: reason },
                        { name: 'โดยแอดมิน', value: `<@${interaction.user.id}>` }
                    )
                    .setThumbnail(targetMember.user.displayAvatarURL())
                    .setTimestamp();

                if (blacklistChannel) await blacklistChannel.send({ embeds: [blacklistEmbed] });
                await interaction.update({ content: `✅ บันทึกรายชื่อ <@${targetId}> ลงห้องบัญชีดำเรียบร้อยแล้ว`, components: [] });
            }

            // 2. แบน / Mute (Ban Options)
            if (selectedValue === 'type_ban') {
                const banSubMenu = new StringSelectMenuBuilder()
                    .setCustomId(`sub_ban_${targetId}_${encodeURIComponent(reason)}`)
                    .setPlaceholder('เลือกระยะเวลาบทลงโทษ...')
                    .addOptions([
                        { label: '🔇 ปิดการพิมพ์/เปิดไมค์ (Timeout 1 ชม.)', value: 'mute_1h' },
                        { label: '🔇 ปิดการพิมพ์/เปิดไมค์ (Timeout 24 ชม.)', value: 'mute_24h' },
                        { label: '⛔ แบนออกจากเซิร์ฟเวอร์ถาวร (Ban)', value: 'ban_perm' }
                    ]);

                const row = new ActionRowBuilder().addComponents(banSubMenu);
                await interaction.update({ content: `⚙️ เลือกระดับการลงโทษสำหรับ <@${targetId}>:`, components: [row] });
            }

            // 3. Report (DM ส่วนตัว + ลงห้องกระทำผิด)
            if (selectedValue === 'type_report') {
                const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

                // ส่ง DM หาผู้ใช้
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('⚠️ การแจ้งเตือนการกระทำผิด')
                        .setDescription(`คุณได้รับการแจ้งเตือนจากทางทีมงาน **${interaction.guild.name}**`)
                        .addFields({ name: 'เหตุผล/รายละเอียด', value: reason })
                        .setColor(0xFF9900);

                    await targetMember.send({ embeds: [dmEmbed] });
                } catch (e) {
                    console.log('ผู้ใช้นี้ปิดรับ DM');
                }

                // ประกาศลงห้องกระทำผิด
                const logEmbed = new EmbedBuilder()
                    .setTitle('🚨 รายงานการกระทำผิด')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: 'ผู้กระทำผิด', value: `<@${targetId}>` },
                        { name: 'เหตุผล', value: reason },
                        { name: 'ผู้จัดการ', value: `<@${interaction.user.id}>` }
                    )
                    .setTimestamp();

                if (reportChannel) await reportChannel.send({ embeds: [logEmbed] });
                await interaction.update({ content: `✅ ส่ง DM แจ้งเตือน และลงบันทึกในห้องกระทำผิดเรียบร้อย`, components: [] });
            }
        }

        // เมนูย่อยของการแบน (Ban Sub Menu)
        if (interaction.customId.startsWith('sub_ban_')) {
            const [, , targetId, encodedReason] = interaction.customId.split('_');
            const reason = decodeURIComponent(encodedReason);
            const action = interaction.values[0];
            const targetMember = await interaction.guild.members.fetch(targetId);

            if (action === 'mute_1h') {
                await targetMember.timeout(60 * 60 * 1000, reason);
                await interaction.update({ content: `✅ ดำเนินการ Timeout <@${targetId}> เป็นเวลา 1 ชั่วโมงเรียบร้อย`, components: [] });
            } else if (action === 'mute_24h') {
                await targetMember.timeout(24 * 60 * 60 * 1000, reason);
                await interaction.update({ content: `✅ ดำเนินการ Timeout <@${targetId}> เป็นเวลา 24 ชั่วโมงเรียบร้อย`, components: [] });
            } else if (action === 'ban_perm') {
                await targetMember.ban({ reason });
                await interaction.update({ content: `⛔ ดำเนินการแบน <@${targetId}> ออกจากเซิร์ฟเวอร์เรียบร้อย`, components: [] });
            }
        }
    }

    // --- จัดการปุ่มฝั่งผู้ใช้ (User Buttons) ---
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_user_report') {
            await interaction.reply({ content: '📩 กรุณาติดต่อแอดมินหรือส่งรายละเอียดปัญหาที่คุณพบได้ที่ห้องนี้ครับ', ephemeral: true });
        }
        if (interaction.customId === 'btn_user_suggest') {
            await interaction.reply({ content: '💡 ขอบคุณสำหรับข้อเสนอแนะ พิมพ์ข้อเสนอแนะของคุณไว้ที่นี่ได้เลยครับ', ephemeral: true });
        }
    }
});

client.login(TOKEN);
