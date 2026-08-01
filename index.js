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
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID;
const BANNED_ROLE_ID = process.env.BANNED_ROLE_ID;
const COMMAND_CHANNEL_ID = process.env.COMMAND_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// 1. Slash Commands Definition
const commands = [
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('ตั้งค่าและสร้างปุ่มส่งเรื่องร้องเรียน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('ตั้งค่าและสร้างปุ่มรายงานผู้กระทำผิด')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('ตั้งค่าและสร้างปุ่มจัดการผู้ใช้ (สำหรับแอดมิน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('setup_dropdown')
        .setDescription('เพิ่ม Dropdown เลือกยศใส่ข้อความเดิม (กำหนดข้อความและยศเองได้เลย)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID ของข้อความเดิมที่ต้องการใส่ Dropdown')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('placeholder')
                .setDescription('ข้อความตัวอย่างบน Dropdown (เช่น: 🎮 เลือกยศเกมของคุณที่นี่...)')
                .setRequired(true))
        .addRoleOption(option => option.setName('role1').setDescription('ยศที่ 1').setRequired(true))
        .addRoleOption(option => option.setName('role2').setDescription('ยศที่ 2').setRequired(false))
        .addRoleOption(option => option.setName('role3').setDescription('ยศที่ 3').setRequired(false))
        .addRoleOption(option => option.setName('role4').setDescription('ยศที่ 4').setRequired(false))
        .addRoleOption(option => option.setName('role5').setDescription('ยศที่ 5').setRequired(false))
        .addRoleOption(option => option.setName('role6').setDescription('ยศที่ 6').setRequired(false))
        .addRoleOption(option => option.setName('role7').setDescription('ยศที่ 7').setRequired(false))
        .addRoleOption(option => option.setName('role8').setDescription('ยศที่ 8').setRequired(false))
        .addRoleOption(option => option.setName('role9').setDescription('ยศที่ 9').setRequired(false))
        .addRoleOption(option => option.setName('role10').setDescription('ยศที่ 10').setRequired(false)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้ว: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อย!');
    } catch (error) {
        console.error('❌ Error Commands:', error);
    }
});

// Helper สร้าง Modal แบบรวดเร็ว
function createSetupModal(customId, title, defaultTitle, defaultDesc, defaultBtn) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
    
    const titleInput = new TextInputBuilder().setCustomId('cfg_title').setLabel('1. หัวข้อ Embed (Title)').setValue(defaultTitle).setStyle(TextInputStyle.Short).setRequired(true);
    const descInput = new TextInputBuilder().setCustomId('cfg_desc').setLabel('2. รายละเอียด (Description)').setValue(defaultDesc).setStyle(TextInputStyle.Paragraph).setRequired(true);
    const btnInput = new TextInputBuilder().setCustomId('cfg_btn_label').setLabel('3. ข้อความบนปุ่ม').setValue(defaultBtn).setStyle(TextInputStyle.Short).setRequired(true);
    const imgInput = new TextInputBuilder().setCustomId('cfg_image_url').setLabel('4. ลิงก์รูป Banner (เว้นว่างได้)').setStyle(TextInputStyle.Short).setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(btnInput),
        new ActionRowBuilder().addComponents(imgInput)
    );
    return modal;
}

// 2. Main Interaction Listener
client.on('interactionCreate', async (interaction) => {
    try {
        // --- A. COMMAND HANDLERS ---
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'setup-ticket') {
                const modal = createSetupModal(
                    'modal_config_ticket', 
                    '⚙️ ตั้งค่าระบบส่งเรื่องร้องเรียน', 
                    '📝 แจ้งปัญหาและส่งเรื่องร้องเรียน', 
                    'กดปุ่มด้านล่างเพื่อส่งเรื่องร้องเรียนหรือแจ้งปัญหากับทีมงาน', 
                    'ส่งเรื่องร้องเรียน'
                );
                return await interaction.showModal(modal);
            }

            if (interaction.commandName === 'setup-report') {
                const modal = createSetupModal(
                    'modal_config_report', 
                    '⚙️ ตั้งค่าระบบรายงานผู้กระทำผิด', 
                    '⚠️ รายงานผู้กระทำผิด / สมาชิกทำผิดกฏ', 
                    'หากพบเห็นสมาชิกทำผิดกฏ สามารถกดปุ่มด้านล่างเพื่อแจ้งทีมงานได้ทันที', 
                    'รายงานผู้กระทำผิด'
                );
                return await interaction.showModal(modal);
            }

            if (interaction.commandName === 'setup-admin') {
                const modal = createSetupModal(
                    'modal_config_admin', 
                    '⚙️ ตั้งค่าแผงควบคุมแอดมิน', 
                    '🛠️ แผงควบคุมระบบจัดการผู้ใช้', 
                    'กดปุ่มด้านล่างเพื่อเปิดแบบฟอร์มจัดการและลงโทษผู้กระทำผิด', 
                    'จัดการผู้ใช้'
                );
                return await interaction.showModal(modal);

            if (commandName === 'setup_dropdown') {
            await interaction.deferReply({ ephemeral: true });

            const messageId = interaction.options.getString('message_id');
            const placeholder = interaction.options.getString('placeholder');

            const roles = [];
            for (let i = 1; i <= 10; i++) {
                const role = interaction.options.getRole(`role${i}`);
                if (role) roles.push(role);
            }

            try {
                const targetMessage = await interaction.channel.messages.fetch(messageId);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_dynamic_roles')
                    .setPlaceholder(placeholder)
                    .setMinValues(0)
                    .setMaxValues(roles.length)
                    .addOptions(
                        roles.map(role => 
                            new StringSelectMenuOptionBuilder()
                                .setLabel(role.name)
                                .setValue(role.id)
                        )
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                await targetMessage.edit({ components: [row] });
                return await interaction.editReply({ content: `✅ เพิ่ม Dropdown รวม ${roles.length} ยศ เรียบร้อยแล้ว!` });

            } catch (err) {
                console.error(err);
                return await interaction.editReply({ content: '❌ หาข้อความไม่พบ! (ต้องใช้คำสั่งในห้องเดียวกับข้อความนั้น)' });
            }
        }

        // --- B. BUTTON HANDLERS ---
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_cmd_ticket') {
                const modal = new ModalBuilder().setCustomId('modal_cmd_ticket_submit').setTitle('📝 แบบฟอร์มส่งเรื่องร้องเรียน');
                const detailInput = new TextInputBuilder().setCustomId('input_detail').setLabel('รายละเอียดเรื่องที่ต้องการแจ้ง').setPlaceholder('พิมพ์รายละเอียดปัญหา...').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(detailInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_cmd_report') {
                const modal = new ModalBuilder().setCustomId('modal_cmd_report_submit').setTitle('⚠️ แบบฟอร์มรายงานผู้กระทำผิด');
                const userInput = new TextInputBuilder().setCustomId('report_target_user').setLabel('1. แท็ก / ID ผู้กระทำผิด').setPlaceholder('ใส่ ID หรือ @username').setStyle(TextInputStyle.Short).setRequired(true);
                const reasonInput = new TextInputBuilder().setCustomId('report_reason').setLabel('2. เหตุผลที่รายงาน').setPlaceholder('ระบุเหตุผล...').setStyle(TextInputStyle.Short).setRequired(true);
                const detailInput = new TextInputBuilder().setCustomId('report_detail').setLabel('3. รายละเอียด/หลักฐาน').setPlaceholder('แนบรายละเอียด...').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userInput),
                    new ActionRowBuilder().addComponents(reasonInput),
                    new ActionRowBuilder().addComponents(detailInput)
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_cmd_admin') {
                const modal = new ModalBuilder().setCustomId('modal_cmd_admin_submit').setTitle('👤 แบบฟอร์มจัดการผู้ใช้');
                const userInput = new TextInputBuilder().setCustomId('admin_target_user').setLabel('1. แท็ก / ID ผู้ใช้').setPlaceholder('ใส่ ID เช่น 123456789 หรือ @username').setStyle(TextInputStyle.Short).setRequired(true);
                const reasonInput = new TextInputBuilder().setCustomId('admin_reason').setLabel('2. เหตุผลที่รายงาน').setPlaceholder('ระบุเหตุผล...').setStyle(TextInputStyle.Short).setRequired(true);
                const problemInput = new TextInputBuilder().setCustomId('admin_problem').setLabel('3. ปัญหาที่พบจากผู้ใช้').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userInput),
                    new ActionRowBuilder().addComponents(reasonInput),
                    new ActionRowBuilder().addComponents(problemInput)
                );
                return await interaction.showModal(modal);
            }
        }

        // --- C. MODAL SUBMIT HANDLERS ---
        if (interaction.isModalSubmit()) {
            // C1. Config Submits
            if (interaction.customId.startsWith('modal_config_')) {
                const title = interaction.fields.getTextInputValue('cfg_title');
                const desc = interaction.fields.getTextInputValue('cfg_desc');
                const btnLabel = interaction.fields.getTextInputValue('cfg_btn_label');
                const imageUrl = interaction.fields.getTextInputValue('cfg_image_url');

                let customIdBtn = 'btn_cmd_ticket';
                let btnStyle = ButtonStyle.Primary;
                let emoji = '📝';
                let color = 0xED4245;

                if (interaction.customId === 'modal_config_report') {
                    customIdBtn = 'btn_cmd_report';
                    btnStyle = ButtonStyle.Warning;
                    emoji = '⚠️';
                    color = 0xFEE75C;
                } else if (interaction.customId === 'modal_config_admin') {
                    customIdBtn = 'btn_cmd_admin';
                    btnStyle = ButtonStyle.Danger;
                    emoji = '👤';
                    color = 0x5865F2;
                }

                const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
                if (imageUrl && imageUrl.startsWith('http')) embed.setImage(imageUrl);

                const btn = new ButtonBuilder().setCustomId(customIdBtn).setLabel(btnLabel).setEmoji(emoji).setStyle(btnStyle);

                await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.reply({ content: '✅ สร้างระบบพร้อมใช้งานเรียบร้อยแล้ว!', ephemeral: true });
            }

            // C2. Form Submits
            if (interaction.customId === 'modal_cmd_ticket_submit') {
                const detailVal = interaction.fields.getTextInputValue('input_detail');
                const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

                const embed = new EmbedBuilder()
                    .setTitle(`🚨 เรื่องร้องเรียนจาก ${interaction.user.username}`)
                    .setColor(0xED4245)
                    .addFields(
                        { name: 'ผู้ส่งเรื่อง', value: `<@${interaction.user.id}>`, inline: false },
                        { name: 'รายละเอียด', value: detailVal, inline: false }
                    ).setTimestamp();

                if (reportChannel) await reportChannel.send({ embeds: [embed] });
                return await interaction.reply({ content: '✅ ส่งข้อมูลให้ทีมงานเรียบร้อยแล้ว!', ephemeral: true });
            }

            if (interaction.customId === 'modal_cmd_report_submit') {
                const targetUser = interaction.fields.getTextInputValue('report_target_user');
                const reason = interaction.fields.getTextInputValue('report_reason');
                const detail = interaction.fields.getTextInputValue('report_detail');
                const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

                const embed = new EmbedBuilder()
                    .setTitle(`⚠️ รายงานผู้กระทำผิด`)
                    .setColor(0xFEE75C)
                    .addFields(
                        { name: 'ผู้ส่งรายงาน', value: `<@${interaction.user.id}>`, inline: false },
                        { name: 'ผู้ถูกรายงาน', value: targetUser, inline: false },
                        { name: 'เหตุผล', value: reason, inline: false },
                        { name: 'รายละเอียด', value: detail, inline: false }
                    ).setTimestamp();

                if (reportChannel) await reportChannel.send({ embeds: [embed] });
                return await interaction.reply({ content: '✅ ส่งรายงานให้ทีมงานเรียบร้อยแล้ว!', ephemeral: true });
            }

            if (interaction.customId === 'modal_cmd_admin_submit') {
                const rawUser = interaction.fields.getTextInputValue('admin_target_user').replace(/[<@!>]/g, '').trim();
                const reason = interaction.fields.getTextInputValue('admin_reason');
                const problem = interaction.fields.getTextInputValue('admin_problem');

                const targetMember = await interaction.guild.members.fetch(rawUser).catch(() => null);
                if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`menu_admin_penalty_${targetMember.id}`)
                    .setPlaceholder('เลือกลงบัญชี (แบน & ลงบัญชีดำ)')
                    .addOptions([
                        { label: '⛔ ลงบัญชีดำ (Blacklist)', description: 'เตะออกจากเซิร์ฟเวอร์ + ประกาศห้องบัญชีดำ', value: 'admin_penalty_blacklist', emoji: '⛔' },
                        { label: '🔨 แบน (Ban / Timeout)', description: 'ให้ยศ "บัญชีถูกแบน" + กำหนดเวลา', value: 'admin_penalty_ban', emoji: '🔨' }
                    ]);

                client.adminTempData = client.adminTempData || new Map();
                client.adminTempData.set(targetMember.id, { reason, problem });

                return await interaction.reply({
                    content: `🎯 **ผู้ถูกจัดการ:** <@${targetMember.id}>\n📝 **เหตุผล:** ${reason}\n⚠️ **ปัญหา:** ${problem}\n\n👇 **เลือกลงโทษ:**`,
                    components: [new ActionRowBuilder().addComponents(selectMenu)],
                    ephemeral: true
                });
            }

            if (interaction.customId.startsWith('modal_admin_ban_time_')) {
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
                        { name: 'ผู้ถูกลงโทษ', value: `<@${targetMember.id}>`, inline: false },
                        { name: 'ระยะเวลา', value: durationStr, inline: true },
                        { name: 'เหตุผล', value: tempData.reason, inline: true },
                        { name: 'ปัญหาที่พบ', value: tempData.problem, inline: false },
                        { name: 'ผู้อนุมัติ', value: `<@${interaction.user.id}>`, inline: false }
                    ).setThumbnail(targetMember.user.displayAvatarURL()).setTimestamp();

                if (banLogChan) await banLogChan.send({ embeds: [banEmbed] });
                return await interaction.reply({ content: `✅ ดำเนินการแบน <@${targetId}> ระยะเวลา \`${durationStr}\` เรียบร้อย!`, ephemeral: true });
            }
        }

        // --- D. SELECT MENU HANDLERS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('menu_admin_penalty_')) {
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
                        ).setThumbnail(targetMember.user.displayAvatarURL()).setTimestamp();

                    if (blacklistChan) await blacklistChan.send({ embeds: [blacklistEmbed] });
                    await targetMember.kick(`[Blacklist] ${tempData.reason}`).catch(() => null);

                    return await interaction.update({ content: `⛔ บันทึก <@${targetId}> ลงบัญชีดำและเตะออกเรียบร้อย!`, components: [] });
                }

                if (selectedOption === 'admin_penalty_ban') {
                    const modal = new ModalBuilder().setCustomId(`modal_admin_ban_time_${targetId}`).setTitle('⏱️ กำหนดระยะเวลาการแบน');
                    const durationInput = new TextInputBuilder().setCustomId('ban_duration').setLabel('ระบุระยะเวลา (เช่น 1d = 1วัน, 12h = 12ชม.)').setPlaceholder('ตัวอย่าง: 7d หรือ 24h').setStyle(TextInputStyle.Short).setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
                    return await interaction.showModal(modal);
                }
            catch (err) {
                console.error('Interaction Exception:', err);
            }
        });

// --------------------------------------------------
// ระบบเช็กสมาชิก !status (แสดงรายชื่อสำหรับคัดคนออก + ส่งลงห้องปฏิบัติการ)
// --------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!status')) return;

    // อ่านค่า ID ห้องจาก Environment Variables
    const COMMAND_CHANNEL_ID = process.env.COMMAND_CHANNEL_ID;
    const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

    // 1. ตรวจสอบห้องสั่งการ
    if (COMMAND_CHANNEL_ID && message.channel.id !== COMMAND_CHANNEL_ID) {
        return message.reply(`⚠️ คำสั่งนี้ใช้ได้เฉพาะในห้องสั่งการ <#${COMMAND_CHANNEL_ID}> เท่านั้นครับ!`)
            .then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
    }

    // 2. เช็กสิทธิ์แอดมิน
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้');
    }

    const waitMsg = await message.reply('🔄 กำลังประมวลผลและรวบรวมรายชื่อสมาชิกที่ไม่เคลื่อนไหว...');

    try {
        const guild = message.guild;
        await guild.members.fetch(); // ดึงสมาชิกทุกคน

        const now = Date.now();
        const members = guild.members.cache.filter(m => !m.user.bot); // ดึงเฉพาะคนจริง

        // รายชื่อสมาชิกแยกตามระยะเวลา
        const inactive30Days = [];
        const inactive90Days = [];
        const noRoleList = [];

        members.forEach(member => {
            // เช็กสมาชิกไม่มียศ
            if (member.roles.cache.size <= 1) {
                noRoleList.push(`<@${member.id}>`);
            }

            if (!member.joinedTimestamp) return;
            const daysInServer = Math.floor((now - member.joinedTimestamp) / (1000 * 60 * 60 * 24));

            if (daysInServer >= 90) {
                inactive90Days.push(`<@${member.id}> (${daysInServer} วัน)`);
            } else if (daysInServer >= 30) {
                inactive30Days.push(`<@${member.id}> (${daysInServer} วัน)`);
            }
        });

        // ฟังก์ชันตัดข้อความไม่ให้ยาวเกินขีดจำกัด Discord (2048 char)
        const formatList = (arr) => {
            if (arr.length === 0) return 'ไม่มี';
            const text = arr.join('\n');
            return text.length > 1024 ? text.substring(0, 1000) + '\n...และอื่นๆ อีกหลายคน' : text;
        };

        const embed = new EmbedBuilder()
            .setTitle(`🚨 [รายชื่อสมาชิกสำหรับคัดออก] - ${guild.name}`)
            .setColor(0xE74C3C)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setDescription(`📊 **สมาชิกคนจริงทั้งหมด:** \`${members.size}\` คน`)
            .addFields(
                { 
                    name: `❓ ไม่มี Role ใดๆ (${noRoleList.length} คน)`, 
                    value: formatList(noRoleList), 
                    inline: false 
                },
                { 
                    name: `🗓️ อยู่มาเกิน 3 เดือน / 90+ วัน (${inactive90Days.length} คน)`, 
                    value: formatList(inactive90Days), 
                    inline: false 
                },
                { 
                    name: `📅 อยู่มาเกิน 1 เดือน / 30+ วัน (${inactive30Days.length} คน)`, 
                    value: formatList(inactive30Days), 
                    inline: false 
                }
            )
            .setFooter({ text: `คำสั่งโดย: ${message.author.tag}` })
            .setTimestamp();

        // 3. ค้นหาห้องปฏิบัติการเพื่อส่งผลลัพธ์
        const logChannel = LOG_CHANNEL_ID ? guild.channels.cache.get(LOG_CHANNEL_ID) : null;

        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
            await waitMsg.edit(`✅ ส่งรายชื่อและผลการตรวจสอบไปที่ห้องปฏิบัติการ <#${LOG_CHANNEL_ID}> เรียบร้อยแล้ว!`);
        } else {
            // กรณีไม่มี LOG_CHANNEL_ID ให้ส่งที่ห้องเดิม
            await waitMsg.edit({ content: '⚠️ ไม่พบการตั้งค่า `LOG_CHANNEL_ID` ผลลัพธ์จึงแสดงในห้องนี้:', embeds: [embed] });
        }

    } catch (error) {
        console.error('Error in !status command:', error);
        await waitMsg.edit('❌ เกิดข้อผิดพลาดขณะประมวลผลข้อมูล');
    }

// --------------------------------------------------
// ตัวจัดการแจกยศอัตโนมัติเมื่อสมาชิกเลือกยศใน Dropdown
// --------------------------------------------------
if (interaction.isStringSelectMenu() && interaction.customId === 'select_dynamic_roles') {
    await interaction.deferReply({ ephemeral: true });

    const selectedRoleIds = interaction.values;
    const member = interaction.member;

    // ดึง ID ยศทั้งหมดที่มีอยู่ใน Dropdown ชุดนั้นๆ
    const allMenuRoleIds = interaction.component.options.map(opt => opt.value);

    try {
        // ถอดยศในกลุ่มนี้ที่ไม่ได้ถูกเลือกออก
        for (const roleId of allMenuRoleIds) {
            if (!selectedRoleIds.includes(roleId) && member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId).catch(() => null);
            }
        }

        // เพิ่มยศใหม่ตามที่ถูกเลือก
        for (const roleId of selectedRoleIds) {
            if (!member.roles.cache.has(roleId)) {
                await member.roles.add(roleId).catch(() => null);
            }
        }

        return await interaction.editReply({ content: '✅ อัปเดตยศของคุณเรียบร้อยแล้ว!' });
    } catch (error) {
        console.error(error);
        return await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการปรับเปลี่ยนยศ กรุณาเช็กสิทธิ์หรือลำดับชั้นยศของบอท' });
    }
}            
});
client.login(process.env.DISCORD_TOKEN);
