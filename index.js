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

// ดึงค่าตัวแปรจาก Environment Variables (ตั้งค่าใน Railway / .env)
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID; // ช่องประกาศคนโดนแบน
const BANNED_ROLE_ID = process.env.BANNED_ROLE_ID;         // ID ยศ "บัญชีถูกแบน"

// --------------------------------------------------
// 1. ลงทะเบียน Slash Commands
// --------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('สร้าง Embed พร้อมปุ่มส่งเรื่องร้องเรียน (สำหรับผู้ใช้)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด Embed').setRequired(true))
        .addStringOption(opt => opt.setName('button_label').setDescription('ชื่อบนปุ่ม (เช่น ส่งเรื่องร้องเรียน)').setRequired(false))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูป Banner (ถ้ามี)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('สร้างปุ่ม "จัดการผู้ใช้" (สำหรับแอดมิน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้ว: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อย!');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการลงทะเบียน Commands:', error);
    }
});

// --------------------------------------------------
// 2. เรียกใช้งาน Slash Commands (/setup-ticket และ /setup-admin)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // คำสั่งสร้างปุ่มส่งเรื่องของผู้ใช้ทั่วไป
    if (commandName === 'setup-ticket') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const buttonLabel = interaction.options.getString('button_label') || 'ส่งเรื่องร้องเรียน';
        const imageUrl = interaction.options.getString('image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0xED4245)
            .setTimestamp();

        if (imageUrl) embed.setImage(imageUrl);

        const btn = new ButtonBuilder()
            .setCustomId('btn_open_report_modal')
            .setLabel(buttonLabel)
            .setEmoji('🚨')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(btn);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างปุ่มเรียบร้อยแล้ว!', ephemeral: true });
    }

    // คำสั่งสร้างปุ่ม "จัดการผู้ใช้" ของแอดมิน
    if (commandName === 'setup-admin') {
        const embed = new EmbedBuilder()
            .setTitle('🛠️ แผงควบคุมระบบจัดการผู้ใช้')
            .setDescription('กดปุ่มด้านล่างเพื่อเปิดแบบฟอร์มจัดการและลงโทษผู้กระทำผิด')
            .setColor(0x5865F2);

        const btn = new ButtonBuilder()
            .setCustomId('btn_open_admin_modal')
            .setLabel('จัดการผู้ใช้')
            .setEmoji('👤')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(btn);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างปุ่มจัดการผู้ใช้เรียบร้อยแล้ว!', ephemeral: true });
    }
});

// --------------------------------------------------
// 3. ดักจับการกดปุ่ม -> เปิดแบบฟอร์ม (Modal)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // --- กรณีผู้ใช้ทั่วไปกดปุ่ม "ส่งเรื่องร้องเรียน" (มีช่องเดียว: รายละเอียด) ---
    if (interaction.customId === 'btn_open_report_modal' || interaction.customId.startsWith('custom_modal_')) {
        const modal = new ModalBuilder()
            .setCustomId('modal_report_submit')
            .setTitle('📝 แบบฟอร์มส่งเรื่องร้องเรียน');

        const detailInput = new TextInputBuilder()
            .setCustomId('input_detail')
            .setLabel('รายละเอียดเรื่องที่ต้องการแจ้ง')
            .setPlaceholder('พิมพ์รายละเอียดปัญหาที่ต้องการแจ้ง...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(detailInput));
        await interaction.showModal(modal);
    }

    // --- กรณีแอดมินกดปุ่ม "จัดการผู้ใช้" (มี 3 ช่อง: ผู้ใช้, เหตุผล, ปัญหา) ---
    if (interaction.customId === 'btn_open_admin_modal') {
        const modal = new ModalBuilder()
            .setCustomId('modal_admin_action_submit')
            .setTitle('👤 แบบฟอร์มจัดการผู้ใช้');

        const userInput = new TextInputBuilder()
            .setCustomId('admin_target_user')
            .setLabel('1. แท็ก / ID ผู้ใช้')
            .setPlaceholder('ใส่ ID เช่น 123456789 หรือ @username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const reasonInput = new TextInputBuilder()
            .setCustomId('admin_reason')
            .setLabel('2. เหตุผลที่รายงาน')
            .setPlaceholder('ระบุเหตุผลการลงโทษ...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const problemInput = new TextInputBuilder()
            .setCustomId('admin_problem')
            .setLabel('3. ปัญหาที่พบจากผู้ใช้')
            .setPlaceholder('ระบุรายละเอียดปัญหาหรือหลักฐานที่พบ...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(reasonInput),
            new ActionRowBuilder().addComponents(problemInput)
        );

        await interaction.showModal(modal);
    }
});

// --------------------------------------------------
// 4. รับค่าแบบฟอร์ม (Modal Submit)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    // --- 4.1 ผู้ใช้ทั่วไปส่งแบบฟอร์มร้องเรียน ---
    if (interaction.customId === 'modal_report_submit' || interaction.customId.startsWith('submit_custom_modal_') || interaction.customId === 'submit_fallback_modal') {
        let detailVal = '';
        try {
            detailVal = interaction.fields.getTextInputValue('input_detail');
        } catch (e) {
            try {
                detailVal = interaction.fields.getTextInputValue('input_field_2');
            } catch (err) {
                detailVal = interaction.fields.getTextInputValue('input_field_1');
            }
        }

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
        await interaction.reply({ content: '✅ ส่งข้อมูลให้ทีมงานเรียบร้อยแล้ว ขอบคุณครับ!', ephemeral: true });
    }

    // --- 4.2 แอดมินส่งแบบฟอร์ม "จัดการผู้ใช้" -> ส่ง Dropdown เลือกลงบัญชี ---
    if (interaction.customId === 'modal_admin_action_submit') {
        const rawUser = interaction.fields.getTextInputValue('admin_target_user').replace(/[<@!>]/g, '').trim();
        const reason = interaction.fields.getTextInputValue('admin_reason');
        const problem = interaction.fields.getTextInputValue('admin_problem');

        const targetMember = await interaction.guild.members.fetch(rawUser).catch(() => null);
        if (!targetMember) {
            return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์ (กรุณาตรวจสอบ ID ให้ถูกต้อง)', ephemeral: true });
        }

        // ตัวเลือกบทลงโทษ (Dropdown)
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`menu_action_type_${targetMember.id}`)
            .setPlaceholder('4. เลือกลงบัญชี (แบน & ลงบัญชีดำ)')
            .addOptions([
                {
                    label: '⛔ ลงบัญชีดำ (Blacklist)',
                    description: 'เตะออกจากเซิร์ฟเวอร์ + ประกาศลงช่องบัญชีดำ',
                    value: 'action_blacklist',
                    emoji: '⛔'
                },
                {
                    label: '🔨 แบน (Ban / Timeout)',
                    description: 'ให้ยศ "บัญชีถูกแบน" + กำหนดวัน/ชั่วโมง + ประกาศช่องแบน',
                    value: 'action_ban',
                    emoji: '🔨'
                }
            ]);

        // บันทึกข้อมูลเข้าแรมชั่วคราวเพื่อนำไปใช้ในขั้นตอน SelectMenu
        client.adminTempData = client.adminTempData || new Map();
        client.adminTempData.set(targetMember.id, { reason, problem });

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({
            content: `🎯 **ผู้ถูกจัดการ:** <@${targetMember.id}>\n📝 **เหตุผล:** ${reason}\n⚠️ **ปัญหา:** ${problem}\n\n👇 **กรุณาเลือกประเภทการลงโทษด้านล่าง:**`,
            components: [row],
            ephemeral: true
        });
    }

    // --- 4.3 แอดมินส่งแบบฟอร์มระบุระยะเวลาแบน ---
    if (interaction.customId.startsWith('modal_ban_duration_')) {
        const targetId = interaction.customId.replace('modal_ban_duration_', '');
        const durationStr = interaction.fields.getTextInputValue('ban_duration');
        
        const tempData = client.adminTempData?.get(targetId) || { reason: 'ไม่ได้ระบุ', problem: 'ไม่ได้ระบุ' };
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้แล้ว', ephemeral: true });
        }

        // 1. แจกยศ "บัญชีถูกแบน"
        if (BANNED_ROLE_ID) {
            await targetMember.roles.add(BANNED_ROLE_ID).catch(() => console.log('ไม่สามารถให้ยศได้ (เช็คยศบอทว่าอยู่สูงกว่าหรือไม่)'));
        }

        // 2. ปิดการสื่อสาร (Timeout) ตามระยะเวลาที่กรอก
        let ms = 0;
        if (durationStr.endsWith('d')) ms = parseInt(durationStr) * 24 * 60 * 60 * 1000;
        else if (durationStr.endsWith('h')) ms = parseInt(durationStr) * 60 * 60 * 1000;
        else if (durationStr.endsWith('m')) ms = parseInt(durationStr) * 60 * 1000;

        if (ms > 0) {
            await targetMember.timeout(ms, tempData.reason).catch(() => null);
        }

        // 3. ส่งประกาศลงช่อง "สมาชิกโดนแบน"
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

        await interaction.reply({ content: `✅ ดำเนินการแบน <@${targetId}> ระยะเวลา \`${durationStr}\` และส่งประกาศเรียบร้อยแล้ว!`, ephemeral: true });
    }
});

// --------------------------------------------------
// 5. ประมวลผลจาก Dropdown (Select Menu)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId.startsWith('menu_action_type_')) {
        const targetId = interaction.customId.replace('menu_action_type_', '');
        const selectedOption = interaction.values[0];
        const tempData = client.adminTempData?.get(targetId) || { reason: 'ไม่ได้ระบุ', problem: 'ไม่ได้ระบุ' };
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) {
            return interaction.update({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', components: [] });
        }

        // --- ถ้าเลือก: ลงบัญชีดำ (Blacklist) ---
        if (selectedOption === 'action_blacklist') {
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

            // 1. ประกาศลงช่อง "บัญชีดำ"
            if (blacklistChan) await blacklistChan.send({ embeds: [blacklistEmbed] });

            // 2. เตะออกจากเซิร์ฟเวอร์ทันที
            await targetMember.kick(`[Blacklist] ${tempData.reason}`).catch(() => null);

            await interaction.update({
                content: `⛔ บันทึกรายชื่อ <@${targetId}> ลงห้องบัญชีดำ และเตะออกจากเซิร์ฟเวอร์เรียบร้อยแล้ว!`,
                components: []
            });
        }

        // --- ถ้าเลือก: แบน (Ban) ---
        if (selectedOption === 'action_ban') {
            // เปิด Modal ให้แอดมินกรอกวัน/ชั่วโมง
            const modal = new ModalBuilder()
                .setCustomId(`modal_ban_duration_${targetId}`)
                .setTitle('⏱️ กำหนดระยะเวลาการแบน');

            const durationInput = new TextInputBuilder()
                .setCustomId('ban_duration')
                .setLabel('ระบุระยะเวลา (เช่น 1d = 1วัน, 12h = 12ชม.)')
                .setPlaceholder('ตัวอย่าง: 7d หรือ 24h หรือ 1m')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
            await interaction.showModal(modal);
        }
    }
});

client.login(TOKEN);
