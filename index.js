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
// 1. ลงทะเบียน Slash Commands (แยก 3 คำสั่งชัดเจน)
// --------------------------------------------------
const commands = [
    // คำสั่งที่ 1: แจ้งปัญหาทั่วไป
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('สร้างปุ่มส่งเรื่องร้องเรียน/แจ้งปัญหาทั่วไป')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด Embed').setRequired(true))
        .addStringOption(opt => opt.setName('button_label').setDescription('ข้อความบนปุ่ม').setRequired(false)),

    // คำสั่งที่ 2: รายงานผู้กระทำผิด (สำหรับผู้ใช้ทั่วไป)
    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('สร้างปุ่มรายงานผู้กระทำผิด (สำหรับผู้ใช้งาน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด Embed').setRequired(true))
        .addStringOption(opt => opt.setName('button_label').setDescription('ข้อความบนปุ่ม').setRequired(false)),

    // คำสั่งที่ 3: จัดการผู้ใช้ (สำหรับแอดมิน)
    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('สร้างปุ่มจัดการผู้ใช้ (สำหรับแอดมินจัดการลงโทษ)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้ว: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียน Slash Commands ทั้ง 3 ตัวเรียบร้อย!');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
    }
});


// ==================================================
// 2. ระบบที่ 1: ส่งเรื่องร้องเรียน/แจ้งปัญหา (/setup-ticket)
// ==================================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const buttonLabel = interaction.options.getString('button_label') || 'ส่งเรื่องร้องเรียน';

        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xED4245).setTimestamp();
        const btn = new ButtonBuilder().setCustomId('btn_cmd_ticket').setLabel(buttonLabel).setEmoji('📝').setStyle(ButtonStyle.Primary);

        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: '✅ สร้างปุ่มส่งเรื่องร้องเรียนเรียบร้อย!', ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_cmd_ticket') {
        const modal = new ModalBuilder().setCustomId('modal_cmd_ticket_submit').setTitle('📝 แบบฟอร์มส่งเรื่องร้องเรียน');
        const detailInput = new TextInputBuilder().setCustomId('input_detail').setLabel('รายละเอียดเรื่องที่ต้องการแจ้ง').setPlaceholder('พิมพ์รายละเอียดปัญหา...').setStyle(TextInputStyle.Paragraph).setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(detailInput));
        await interaction.showModal(modal);
    }

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
// 3. ระบบที่ 2: รายงานผู้กระทำผิด (/setup-report)
// ==================================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-report') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const buttonLabel = interaction.options.getString('button_label') || 'รายงานผู้กระทำผิด';

        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xFEE75C).setTimestamp();
        const btn = new ButtonBuilder().setCustomId('btn_cmd_report').setLabel(buttonLabel).setEmoji('⚠️').setStyle(ButtonStyle.Warning);

        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: '✅ สร้างปุ่มรายงานผู้กระทำผิดเรียบร้อย!', ephemeral: true });
    }

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
        await interaction.reply({ content: '✅ ส่งรายงานการกระทำผิดให้ทีมงานตรวจสอบแล้ว!', ephemeral: true });
    }
});


// ==================================================
// 4. ระบบที่ 3: แอดมินจัดการผู้ใช้ (/setup-admin)
// ==================================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-admin') {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ แผงควบคุมระบบจัดการผู้ใช้')
            .setDescription('กดปุ่มด้านล่างเพื่อเปิดแบบฟอร์มจัดการและลงโทษผู้กระทำผิด')
            .setColor(0x5865F2);

        const btn = new ButtonBuilder().setCustomId('btn_cmd_admin').setLabel('จัดการผู้ใช้').setEmoji('👤').setStyle(ButtonStyle.Danger);

        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: '✅ สร้างปุ่มจัดการผู้ใช้เรียบร้อย!', ephemeral: true });
    }

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
