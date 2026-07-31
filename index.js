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

// ดึงค่าจาก Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID;
const BANNED_ROLE_ID = process.env.BANNED_ROLE_ID;

// --------------------------------------------------
// 1. ลงทะเบียน Slash Commands (พิมพ์คำสั่งสั้นๆ ได้เลย)
// --------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('ตั้งค่าและสร้างปุ่มส่งเรื่องร้องเรียนในช่องนี้')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('ตั้งค่าและสร้างปุ่มรายงานผู้กระทำผิดในช่องนี้')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('ตั้งค่าและสร้างปุ่มจัดการผู้ใช้ในช่องนี้ (สำหรับแอดมิน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้ว: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อย!');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
    }
});


// ==================================================
// 2. ระบบที่ 1: /setup-ticket (ระบบแจ้งเรื่องร้องเรียน)
// ==================================================

// 2.1 พิมพ์คำสั่ง -> เด้งแบบฟอร์มให้ตั้งค่าข้อความ/ปุ่ม
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
        const modal = new ModalBuilder()
            .setCustomId('modal_config_ticket')
            .setTitle('⚙️ ตั้งค่าระบบส่งเรื่องร้องเรียน');

        const titleInput = new TextInputBuilder()
            .setCustomId('cfg_title')
            .setLabel('1. หัวข้อ Embed (Title)')
            .setPlaceholder('เช่น 📝 ศูนย์รับเรื่องร้องเรียน')
            .setValue('📝 แจ้งปัญหาและส่งเรื่องร้องเรียน')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descInput = new TextInputBuilder()
            .setCustomId('cfg_desc')
            .setLabel('2. รายละเอียดข้อความ (Description)')
            .setPlaceholder('พิมพ์รายละเอียดที่คุณต้องการแสดง...')
            .setValue('กดปุ่มด้านล่างเพื่อส่งเรื่องร้องเรียนหรือแจ้งปัญหากับทีมงาน')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const btnLabelInput = new TextInputBuilder()
            .setCustomId('cfg_btn_label')
            .setLabel('3. ข้อความบนปุ่ม')
            .setPlaceholder('เช่น ส่งเรื่องร้องเรียน')
            .setValue('ส่งเรื่องร้องเรียน')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const imgInput = new TextInputBuilder()
            .setCustomId('cfg_image_url')
            .setLabel('4. ลิงก์รูปภาพ Banner (ถ้าไม่มีให้เว้นว่างไว้)')
            .setPlaceholder('https://example.com/image.png')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(btnLabelInput),
            new ActionRowBuilder().addComponents(imgInput)
        );

        await interaction.showModal(modal);
    }

    // 2.2 กดยืนยันแบบฟอร์ม -> สร้าง Embed + ปุ่มให้อัตโนมัติในช่องนั้น
    if (interaction.isModalSubmit() && interaction.customId === 'modal_config_ticket') {
        const title = interaction.fields.getTextInputValue('cfg_title');
        const desc = interaction.fields.getTextInputValue('cfg_desc');
        const btnLabel = interaction.fields.getTextInputValue('cfg_btn_label');
        const imageUrl = interaction.fields.getTextInputValue('cfg_image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(0xED4245)
            .setTimestamp();

        if (imageUrl && imageUrl.startsWith('http')) {
            embed.setImage(imageUrl);
        }

        const btn = new ButtonBuilder()
            .setCustomId('btn_cmd_ticket')
            .setLabel(btnLabel)
            .setEmoji('📝')
            .setStyle(ButtonStyle.Primary);

        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: '✅ สร้างระบบส่งเรื่องร้องเรียนพร้อมใช้งานในห้องนี้แล้ว!', ephemeral: true });
    }

    // 2.3 ผู้ใช้กดปุ่มส่งเรื่อง -> เด้งฟอร์มรับเรื่อง (ช่องเดียว)
    if (interaction.isButton() && interaction.customId === 'btn_cmd_ticket') {
        const modal = new ModalBuilder().setCustomId('modal_cmd_ticket_submit').setTitle('📝 แบบฟอร์มส่งเรื่องร้องเรียน');
        const detailInput = new TextInputBuilder().setCustomId('input_detail').setLabel('รายละเอียดเรื่องที่ต้องการแจ้ง').setPlaceholder('พิมพ์รายละเอียดปัญหา...').setStyle(TextInputStyle.Paragraph).setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(detailInput));
        await interaction.showModal(modal);
    }

    // 2.4 ผู้ใช้ส่งฟอร์ม -> ส่งข้อมูลเข้า Log
    if (interaction.isModalSubmit() && interaction.customId === 'modal_cmd_ticket_submit') {
        const detailVal = interaction.fields.getTextInputValue('input_detail');
        const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setTitle(`🚨 ผู้ใช้ ${interaction.user.username} รายงานปัญหา`)
            .setColor(0xED4245)
            .addFields(
                { name: 'ผู้ส่งรายงาน', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
                { name: 'รายละเอียดเรื่องที่ต้องการแจ้ง', value: detailVal, inline: false }
            )
            .setTimestamp();

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ส่งข้อมูลให้ทีมงานเรียบร้อยแล้ว!', ephemeral: true });
    }
});


// ==================================================
// 3. ระบบที่ 2: /setup-report (ระบบรายงานผู้กระทำผิด)
// ==================================================

// 3.1 พิมพ์คำสั่ง -> เด้งแบบฟอร์มให้ตั้งค่า
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-report') {
        const modal = new ModalBuilder()
            .setCustomId('modal_config_report')
            .setTitle('⚙️ ตั้งค่าระบบรายงานผู้กระทำผิด');

        const titleInput = new TextInputBuilder()
            .setCustomId('cfg_title')
            .setLabel('1. หัวข้อ Embed (Title)')
            .setValue('⚠️ รายงานผู้กระทำผิด / สมาชิกทำผิดกฏ')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descInput = new TextInputBuilder()
            .setCustomId('cfg_desc')
            .setLabel('2. รายละเอียดข้อความ (Description)')
            .setValue('หากพบเห็นสมาชิกทำผิดกฏ สามารถกดปุ่มด้านล่างเพื่อแจ้งทีมงานได้ทันที')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const btnLabelInput = new TextInputBuilder()
            .setCustomId('cfg_btn_label')
            .setLabel('3. ข้อความบนปุ่ม')
            .setValue('รายงานผู้กระทำผิด')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const imgInput = new TextInputBuilder()
            .setCustomId('cfg_image_url')
            .setLabel('4. ลิงก์รูปภาพ Banner (ถ้าไม่มีให้เว้นว่างไว้)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(btnLabelInput),
            new ActionRowBuilder().addComponents(imgInput)
        );

        await interaction.showModal(modal);
    }

    // 3.2 กดยืนยันแบบฟอร์ม -> สร้าง Embed + ปุ่มให้อัตโนมัติ
    if (interaction.isModalSubmit() && interaction.customId === 'modal_config_report') {
        const title = interaction.fields.getTextInputValue('cfg_title');
        const desc = interaction.fields.getTextInputValue('cfg_desc');
        const btnLabel = interaction.fields.getTextInputValue('cfg_btn_label');
        const imageUrl = interaction.fields.getTextInputValue('cfg_image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(0xFEE75C)
            .setTimestamp();

        if (imageUrl && imageUrl.startsWith('http')) {
            embed.setImage(imageUrl);
        }

        const btn = new ButtonBuilder()
            .setCustomId('btn_cmd_report')
            .setLabel(btnLabel)
            .setEmoji('⚠️')
            .setStyle(ButtonStyle.Warning);

        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: '✅ สร้างระบบรายงานผู้กระทำผิดพร้อมใช้งานในห้องนี้แล้ว!', ephemeral: true });
    }

    // 3.3 กดปุ่ม -> เด้งฟอร์มให้สมาชิกกรอกข้อมูลรายงาน
    if (interaction.isButton() && interaction.customId === 'btn_cmd_report') {
        const modal = new ModalBuilder().setCustomId('modal_cmd_report_submit').setTitle('⚠️ แบบฟอร์มรายงานผู้กระทำผิด');

        const userInput = new TextInputBuilder().setCustomId('report_target_user').setLabel('1. แท็ก / ID ผู้กระทำผิด').setPlaceholder('ใส่ ID หรือ @username').setStyle(TextInputStyle.Short).setRequired(true);
        const reasonInput = new TextInputBuilder().setCustomId('report_reason').setLabel('2. เหตุผลที่รายงาน').setPlaceholder('ระบุเหตุผล...').setStyle(TextInputStyle.Short).setRequired(true);
        const detailInput = new TextInputBuilder().setCustomId('report_detail').setLabel('3. รายละเอียด/หลักฐาน').setPlaceholder('แนบรายละเอียด หรือลิงก์รูปภาพหลักฐาน...').setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(reasonInput),
            new ActionRowBuilder().addComponents(detailInput)
        );
        await interaction.showModal(modal);
    }

    // 3.4 ส่งรายงานเข้า Log
    if (interaction.isModalSubmit() && interaction.customId === 'modal_cmd_report_submit') {
        const targetUser = interaction.fields.getTextInputValue('report_target_user');
        const reason = interaction.fields.getTextInputValue('report_reason');
        const detail = interaction.fields.getTextInputValue('report_detail');
        const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ มีการรายงานผู้กระทำผิด`)
            .setColor(0xFEE75C)
            .addFields(
                { name: 'ผู้ส่งรายงาน', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
                { name: 'ผู้ถูกรายงาน', value: targetUser, inline: false },
                { name: 'เหตุผล', value: reason, inline: false },
                { name: 'รายละเอียด/หลักฐาน', value: detail, inline: false }
            )
            .setTimestamp();

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ส่งรายงานให้ทีมงานเรียบร้อยแล้ว!', ephemeral: true });
    }
});


// ==================================================
// 4. ระบบที่ 3: /setup-admin (ระบบจัดการผู้ใช้สำหรับแอดมิน)
// ==================================================

// 4.1 พิมพ์คำสั่ง -> เด้งแบบฟอร์มให้ตั้งค่า
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-admin') {
        const modal = new ModalBuilder()
            .setCustomId('modal_config_admin')
            .setTitle('⚙️ ตั้งค่าแผงควบคุมแอดมิน');

        const titleInput = new TextInputBuilder()
            .setCustomId('cfg_title')
            .setLabel('1. หัวข้อ Embed (Title)')
            .setValue('🛠️ แผงควบคุมระบบจัดการผู้ใช้')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descInput = new TextInputBuilder()
            .setCustomId('cfg_desc')
            .setLabel('2. รายละเอียดข้อความ (Description)')
            .setValue('กดปุ่มด้านล่างเพื่อเปิดแบบฟอร์มจัดการและลงโทษผู้กระทำผิด')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const btnLabelInput = new TextInputBuilder()
            .setCustomId('cfg_btn_label')
            .setLabel('3. ข้อความบนปุ่ม')
            .setValue('จัดการผู้ใช้')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const imgInput = new TextInputBuilder()
            .setCustomId('cfg_image_url')
            .setLabel('4. ลิงก์รูปภาพ Banner (ถ้าไม่มีให้เว้นว่างไว้)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(btnLabelInput),
            new ActionRowBuilder().addComponents(imgInput)
        );

        await interaction.showModal(modal);
    }

    // 4.2 กดยืนยันแบบฟอร์ม -> สร้าง Embed + ปุ่มให้อัตโนมัติ
    if (interaction.isModalSubmit() && interaction.customId === 'modal_config_admin') {
        const title = interaction.fields.getTextInputValue('cfg_title');
        const desc = interaction.fields.getTextInputValue('cfg_desc');
        const btnLabel = interaction.fields.getTextInputValue('cfg_btn_label');
        const imageUrl = interaction.fields.getTextInputValue('cfg_image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(desc)
            .setColor(0x5865F2)
            .setTimestamp();

        if (imageUrl && imageUrl.startsWith('http')) {
            embed.setImage(imageUrl);
        }

        const btn = new ButtonBuilder()
            .setCustomId('btn_cmd_admin')
            .setLabel(btnLabel)
            .setEmoji('👤')
            .setStyle(ButtonStyle.Danger);

        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: '✅ สร้างปุ่มจัดการผู้ใช้พร้อมใช้งานในห้องนี้แล้ว!', ephemeral: true });
    }

    // 4.3 แอดมินกดปุ่ม -> เปิด Modal กรอกข้อมูลผู้ใช้ที่ทำผิด
    if (interaction.isButton() && interaction.customId === 'btn_cmd_admin') {
        const modal = new ModalBuilder().setCustomId('modal_cmd_admin_submit').setTitle('👤 แบบฟอร์มจัดการผู้ใช้');

        const userInput = new TextInputBuilder().setCustomId('admin_target_user').setLabel('1. แท็ก / ID ผู้ใช้').setPlaceholder('ใส่ ID เช่น 123456789 หรือ @username').setStyle(TextInputStyle.Short).setRequired(true);
        const reasonInput = new TextInputBuilder().setCustomId('admin_reason').setLabel('2. เหตุผลที่รายงาน').setPlaceholder('ระบุเหตุผลการลงโทษ...').setStyle(TextInputStyle.Short).setRequired(true);
        const problemInput = new TextInputBuilder().setCustomId('admin_problem').setLabel('3. ปัญหาที่พบจากผู้ใช้').setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(reasonInput),
            new ActionRowBuilder().addComponents(problemInput)
        );
        await interaction.showModal(modal);
    }

    // 4.4 แอดมินกดส่ง -> แสดง Dropdown เลือกลงโทษ
    if (interaction.isModalSubmit() && interaction.customId === 'modal_cmd_admin_submit') {
        const rawUser = interaction.fields.getTextInputValue('admin_target_user').replace(/[<@!>]/g, '').trim();
        const reason = interaction.fields.getTextInputValue('admin_reason');
        const problem = interaction.fields.getTextInputValue('admin_problem');

        const targetMember = await interaction.guild.members.fetch(rawUser).catch(() => null);
        if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`menu_admin_penalty_${targetMember.id}`)
            .setPlaceholder('4. เลือกลงบัญชี (แบน & ลงบัญชีดำ)')
            .addOptions([
                { label: '⛔ ลงบัญชีดำ (Blacklist)', description: 'เตะออกจากเซิร์ฟเวอร์ + ประกาศห้องบัญชีดำ', value: 'admin_penalty_blacklist', emoji: '⛔' },
                { label: '🔨 แบน (Ban / Timeout)', description: 'ให้ยศ "บัญชีถูกแบน" + กำหนดเวลา + ประกาศห้องแบน', value: 'admin_penalty_ban', emoji: '🔨' }
            ]);

        client.adminTempData = client.adminTempData || new Map();
        client.adminTempData.set(targetMember.id, { reason, problem });

        await interaction.reply({
            content: `🎯 **ผู้ถูกจัดการ:** <@${targetMember.id}>\n📝 **เหตุผล:** ${reason}\n⚠️ **ปัญหา:** ${problem}\n\n👇 **กรุณาเลือกประเภทการลงโทษ:**`,
            components: [new ActionRowBuilder().addComponents(selectMenu)],
            ephemeral: true
        });
    }

    // 4.5 เลือกจาก Dropdown
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('menu_admin_penalty_')) {
        const targetId = interaction.customId.replace('menu_admin_penalty_', '');
        const selectedOption = interaction.values[0];
        const tempData = client.adminTempData?.get(targetId) || { reason: 'ไม่ได้ระบุ', problem: 'ไม่ได้ระบุ' };
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.update({ content: '❌ ไม่พบผู้ใช้คนนี้แล้ว', components: [] });

        if (selectedOption === 'admin_penalty_blacklist') {
            const blacklistChan = interaction.guild.channels.cache.get(BLACKLIST_CHANNEL_ID);
            const blacklistEmbed = new EmbedBuilder()
                .setTitle('⛔ ประกาศรายชื่อบัญชีดำ (Blacklist)')
                .setColor(0x000000)
                .addFields(
                    { name: 'ผู้ถูกบันทึก', value: `${targetMember.user.tag} (${targetMember.id})`, inline: false },
                    { name: 'เหตุผล', value: tempData.reason, inline: false },
                    { name: 'ปัญหาที่พบ', value: tempData.problem, inline: false },
                    { name: 'โดยแอดมิน', value: `<@${interaction.user.id}>`, inline: false }
                )
                .setThumbnail(targetMember.user.displayAvatarURL())
                .setTimestamp();

            if (blacklistChan) await blacklistChan.send({ embeds: [blacklistEmbed] });
            await targetMember.kick(`[Blacklist] ${tempData.reason}`).catch(() => null);

            await interaction.update({ content: `⛔ บันทึกรายชื่อ <@${targetId}> ลงห้องบัญชีดำ และเตะออกจากเซิร์ฟเวอร์เรียบร้อย!`, components: [] });
        }

        if (selectedOption === 'admin_penalty_ban') {
            const modal = new ModalBuilder().setCustomId(`modal_admin_ban_time_${targetId}`).setTitle('⏱️ กำหนดระยะเวลาการแบน');
            const durationInput = new TextInputBuilder().setCustomId('ban_duration').setLabel('ระบุระยะเวลา (เช่น 1d = 1วัน, 12h = 12ชม.)').setPlaceholder('ตัวอย่าง: 7d หรือ 24h').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
            await interaction.showModal(modal);
        }
    }

    // 4.6 ใส่เวลาแบน -> ดำเนินการ
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_admin_ban_time_')) {
        const targetId = interaction.customId.replace('modal_admin_ban_time_', '');
        const durationStr = interaction.fields.getTextInputValue('ban_duration');
        const tempData = client.adminTempData?.get(targetId) || { reason: 'ไม่ได้ระบุ', problem: 'ไม่ได้ระบุ' };
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้แล้ว', ephemeral: true });

        if (BANNED_ROLE_ID) await targetMember.roles.add(BANNED_ROLE_ID).catch(() => null);

        let ms = 0;
        if (durationStr.endsWith('d')) ms = parseInt(durationStr) * 24 * 60 * 60 * 1000;
        else if (durationStr.endsWith('h')) ms = parseInt(durationStr) * 60 * 60 * 1000;
        else if (durationStr.endsWith('m')) ms = parseInt(durationStr) * 60 * 1000;

        if (ms > 0) await targetMember.timeout(ms, tempData.reason).catch(() => null);

        const banLogChan = interaction.guild.channels.cache.get(BAN_LOG_CHANNEL_ID || REPORT_LOG_CHANNEL_ID);
        const banEmbed = new EmbedBuilder()
            .setTitle('🔨 ประกาศสมาชิกโดนแบน')
            .setColor(0xFF0000)
            .addFields(
                { name: 'ผู้ถูกลงโทษ', value: `<@${targetMember.id}> (${targetMember.user.tag})`, inline: false },
                { name: 'ระยะเวลา', value: durationStr, inline: true },
                { name: 'เหตุผล', value: tempData.reason, inline: true },
                { name: 'ปัญหาที่พบ', value: tempData.problem, inline: false },
                { name: 'ผู้อนุมัติ', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setThumbnail(targetMember.user.displayAvatarURL())
            .setTimestamp();

        if (banLogChan) await banLogChan.send({ embeds: [banEmbed] });
        await interaction.reply({ content: `✅ ดำเนินการแบน <@${targetId}> ระยะเวลา \`${durationStr}\` และส่งประกาศเรียบร้อย!`, ephemeral: true });
    }
});

client.login(TOKEN);
