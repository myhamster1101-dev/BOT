const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
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

// ดึงค่าจาก Variables ใน Railway
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;

// --------------------------------------------------
// 1. ลงทะเบียน Slash Commands แบบแยกปุ่ม
// --------------------------------------------------
const commands = [
    // 1.1 ปุ่มแจ้งปัญหา
    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('สร้าง Embed และปุ่มสำหรับแจ้งปัญหา/รายงาน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด').setRequired(true))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูป Banner (ถ้ามี)').setRequired(false)),

    // 1.2 ปุ่มข้อเสนอแนะ
    new SlashCommandBuilder()
        .setName('setup-suggest')
        .setDescription('สร้าง Embed และปุ่มสำหรับส่งข้อเสนอแนะ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด').setRequired(true))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูป Banner (ถ้ามี)').setRequired(false)),

    // 1.3 ปุ่มรายงานบัญชีดำ (ฝั่งผู้ใช้)
    new SlashCommandBuilder()
        .setName('setup-blacklist-btn')
        .setDescription('สร้าง Embed และปุ่มสำหรับรายงานบัญชีดำ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด').setRequired(true))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูป Banner (ถ้ามี)').setRequired(false)),

    // 1.4 คำสั่งแอดมินจัดการสมาชิก
    new SlashCommandBuilder()
        .setName('action')
        .setDescription('จัดการสมาชิก (Blacklist / Ban / Report)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('target').setDescription('เลือกผู้ใช้ที่ต้องการจัดการ').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('ระบุเหตุผล').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้วในชื่อ: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ อัปเดต Slash Commands สำเร็จแล้ว!');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
    }
});

// --------------------------------------------------
// 2. ประมวลผล Slash Commands
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // ฟังก์ชั่นช่วยสร้าง Embed
    const createBaseEmbed = (title, description, imageUrl, color) => {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
        if (imageUrl) embed.setImage(imageUrl);
        return embed;
    };

    // --- /setup-report ---
    if (commandName === 'setup-report') {
        const embed = createBaseEmbed(
            interaction.options.getString('title'),
            interaction.options.getString('description'),
            interaction.options.getString('image_url'),
            0xFF3333
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_user_report').setLabel('🚨 แจ้งปัญหา / รายงาน').setStyle(ButtonStyle.Danger)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างปุ่มแจ้งปัญหาเรียบร้อย!', ephemeral: true });
    }

    // --- /setup-suggest ---
    if (commandName === 'setup-suggest') {
        const embed = createBaseEmbed(
            interaction.options.getString('title'),
            interaction.options.getString('description'),
            interaction.options.getString('image_url'),
            0x3399FF
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_user_suggest').setLabel('💡 ส่งข้อเสนอแนะ').setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างปุ่มข้อเสนอแนะเรียบร้อย!', ephemeral: true });
    }

    // --- /setup-blacklist-btn ---
    if (commandName === 'setup-blacklist-btn') {
        const embed = createBaseEmbed(
            interaction.options.getString('title'),
            interaction.options.getString('description'),
            interaction.options.getString('image_url'),
            0x2B2D31
        );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_user_blacklist').setLabel('⛔ รายงานบัญชีดำ').setStyle(ButtonStyle.Secondary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างปุ่มรายงานบัญชีดำเรียบร้อย!', ephemeral: true });
    }

    // --- /action (คำสั่งแอดมิน) ---
    if (commandName === 'action') {
        if (ADMIN_CHANNEL_ID && interaction.channelId !== ADMIN_CHANNEL_ID) {
            return interaction.reply({ content: '❌ ใช้ได้เฉพาะในห้องแอดมินเท่านั้น!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_${targetUser.id}_${encodeURIComponent(reason)}`)
            .setPlaceholder('เลือกรายการดำเนินการ...')
            .addOptions([
                { label: '⛔ ลงบัญชีดำ (Blacklist)', description: 'ประกาศลงห้องบัญชีดำทันที', value: 'type_blacklist' },
                { label: '🔨 ลงโทษแบน / Mute (Ban/Timeout)', description: 'เลือกประเภทและระยะเวลาลงโทษ', value: 'type_ban' },
                { label: '📩 แจ้งเตือนข้อผิดพลาด (Report/DM)', description: 'ส่ง DM หาผู้ใช้ และบันทึกลงห้องกระทำผิด', value: 'type_report' },
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ 
            content: `🎯 **จัดการผู้ใช้:** <@${targetUser.id}>\n📝 **เหตุผล:** ${reason}`, 
            components: [row] 
        });
    }
});

// --------------------------------------------------
// 3. ประมวลผลการกดปุ่ม (User กดปุ่มเปิด Modal กรอกฟอร์ม)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // กดปุ่มแจ้งปัญหา
    if (interaction.customId === 'btn_user_report') {
        const modal = new ModalBuilder().setCustomId('modal_report').setTitle('🚨 แบบฟอร์มแจ้งปัญหาการใช้งาน');
        const input = new TextInputBuilder().setCustomId('detail').setLabel('รายละเอียดปัญหาที่พบ').setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    // กดปุ่มข้อเสนอแนะ
    if (interaction.customId === 'btn_user_suggest') {
        const modal = new ModalBuilder().setCustomId('modal_suggest').setTitle('💡 แบบฟอร์มเสนอความคิดเห็น');
        const input = new TextInputBuilder().setCustomId('detail').setLabel('ข้อเสนอแนะของคุณ').setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }

    // กดปุ่มรายงานบัญชีดำ
    if (interaction.customId === 'btn_user_blacklist') {
        const modal = new ModalBuilder().setCustomId('modal_blacklist').setTitle('⛔ แบบฟอร์มรายงานบัญชีดำ');
        const target = new TextInputBuilder().setCustomId('target').setLabel('ชื่อ / ID ผู้ถูกรายงาน').setStyle(TextInputStyle.Short).setRequired(true);
        const reason = new TextInputBuilder().setCustomId('reason').setLabel('เหตุผลและหลักฐานการโกง').setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(target), new ActionRowBuilder().addComponents(reason));
        await interaction.showModal(modal);
    }
});

// --------------------------------------------------
// 4. ประมวลผลการส่ง Modal (ฟอร์มที่กรอกเสร็จแล้ว)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

    if (interaction.customId === 'modal_report' || interaction.customId === 'modal_suggest') {
        const isReport = interaction.customId === 'modal_report';
        const detail = interaction.fields.getTextInputValue('detail');

        const embed = new EmbedBuilder()
            .setTitle(isReport ? '🚨 มีการแจ้งปัญหาใหม่' : '💡 มีข้อเสนอแนะใหม่')
            .setColor(isReport ? 0xFF0000 : 0x0099FF)
            .addFields(
                { name: 'ผู้ส่ง', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: 'รายละเอียด', value: detail }
            )
            .setTimestamp();

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ข้อมูลของคุณถูกส่งไปยังทีมงานเรียบร้อยแล้ว ขอบคุณครับ!', ephemeral: true });
    }

    if (interaction.customId === 'modal_blacklist') {
        const target = interaction.fields.getTextInputValue('target');
        const reason = interaction.fields.getTextInputValue('reason');

        const embed = new EmbedBuilder()
            .setTitle('⛔ มีรายงานบัญชีดำใหม่ (รอตรวจสอบ)')
            .setColor(0x000000)
            .addFields(
                { name: 'ผู้ส่งรายงาน', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'ผู้ถูกรายงาน', value: target, inline: true },
                { name: 'เหตุผล/หลักฐาน', value: reason }
            )
            .setTimestamp();

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ส่งรายงานบัญชีดำให้แอดมินตรวจสอบเรียบร้อยแล้ว!', ephemeral: true });
    }
});

// --------------------------------------------------
// 5. ประมวลผล Dropdown เมนูแอดมิน
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    // เมนูหลักแอดมิน
    if (interaction.customId.startsWith('admin_select_')) {
        const [, , targetId, encodedReason] = interaction.customId.split('_');
        const reason = decodeURIComponent(encodedReason);
        const selectedValue = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

        // บัญชีดำ
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

        // เลือกเวลา Timeout / Ban
        if (selectedValue === 'type_ban') {
            const banSubMenu = new StringSelectMenuBuilder()
                .setCustomId(`sub_ban_${targetId}_${encodeURIComponent(reason)}`)
                .setPlaceholder('เลือกระยะเวลาการบทลงโทษ...')
                .addOptions([
                    { label: '🔇 ปิดการพิมพ์/เปิดไมค์ (Timeout 1 ชม.)', value: 'mute_1h' },
                    { label: '🔇 ปิดการพิมพ์/เปิดไมค์ (Timeout 24 ชม.)', value: 'mute_24h' },
                    { label: '⛔ แบนออกจากเซิร์ฟเวอร์ถาวร (Ban)', value: 'ban_perm' }
                ]);

            const row = new ActionRowBuilder().addComponents(banSubMenu);
            await interaction.update({ content: `⚙️ เลือกระดับการลงโทษสำหรับ <@${targetId}>:`, components: [row] });
        }

        // Report ส่ง DM + บันทึกลงห้อง Log
        if (selectedValue === 'type_report') {
            const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ แจ้งเตือนการกระทำผิด')
                    .setDescription(`คุณได้รับการแจ้งเตือนจากทางทีมงาน **${interaction.guild.name}**`)
                    .addFields({ name: 'เหตุผล/รายละเอียด', value: reason })
                    .setColor(0xFF9900);
                await targetMember.send({ embeds: [dmEmbed] });
            } catch (e) {
                console.log('ส่ง DM ไม่สำเร็จ');
            }

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

    // เมนูย่อยสำหรับการแบน/Timeout
    if (interaction.customId.startsWith('sub_ban_')) {
        const [, , targetId, encodedReason] = interaction.customId.split('_');
        const reason = decodeURIComponent(encodedReason);
        const action = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId);

        if (action === 'mute_1h') {
            await targetMember.timeout(60 * 60 * 1000, reason);
            await interaction.update({ content: `✅ ดำเนินการ Timeout <@${targetId}> 1 ชั่วโมงเรียบร้อย`, components: [] });
        } else if (action === 'mute_24h') {
            await targetMember.timeout(24 * 60 * 60 * 1000, reason);
            await interaction.update({ content: `✅ ดำเนินการ Timeout <@${targetId}> 24 ชั่วโมงเรียบร้อย`, components: [] });
        } else if (action === 'ban_perm') {
            await targetMember.ban({ reason });
            await interaction.update({ content: `⛔ ดำเนินการแบน <@${targetId}> ออกจากเซิร์ฟเวอร์เรียบร้อย`, components: [] });
        }
    }
});

client.login(TOKEN);
