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
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
            }
        }
    } catch (err) {
        console.error('Interaction Exception:', err);
    }
});

// --------------------------------------------------
// ระบบเช็กสมาชิกที่ไม่แอคทีฟ / คนซุ่มด้วยคำสั่ง !status
// --------------------------------------------------
client.on('messageCreate', async (message) => {
    // ป้องกันไม่ให้บอทอ่านข้อความตัวเอง หรือข้อความที่ไม่ใช่คำสั่ง !status
    if (message.author.bot || !message.content.startsWith('!status')) return;

    // เช็กสิทธิ์ว่าต้องเป็นแอดมินหรือผู้จัดการสมาชิกเท่านั้น
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ (ต้องมีสิทธิ์ Moderate Members ขึ้นไป)');
    }

    const waitMsg = await message.reply('🔄 กำลังประมวลผลและเช็กข้อมูลสมาชิกทั้งหมดในเซิร์ฟเวอร์...');

    try {
        const guild = message.guild;
        await guild.members.fetch(); // ดึงข้อมูลสมาชิกทั้งหมด

        const now = Date.now();
        const members = guild.members.cache.filter(m => !m.user.bot); // ดึงเฉพาะคนจริง ไม่รวมบอท

        // ตัวแปรจัดกลุ่มสมาชิกตามจำนวนวันที่อยู่ในเซิร์ฟเวอร์
        let over30Days = 0;  // เกิน 1 เดือน (30 วัน)
        let over90Days = 0;  // เกิน 3 เดือน (90 วัน)
        let over180Days = 0; // เกิน 6 เดือน (180 วัน)
        let over365Days = 0; // เกิน 1 ปี (365 วัน)

        members.forEach(member => {
            const joinedTimestamp = member.joinedTimestamp;
            if (!joinedTimestamp) return;

            const daysInServer = Math.floor((now - joinedTimestamp) / (1000 * 60 * 60 * 24));

            if (daysInServer >= 365) over365Days++;
            else if (daysInServer >= 180) over180Days++;
            else if (daysInServer >= 90) over90Days++;
            else if (daysInServer >= 30) over30Days++;
        });

        // เช็กจำนวนคนที่ไม่มี Role (เสี่ยงที่จะเป็นบัญชีร้าง/ไม่ใช้งาน)
        const noRoleMembers = members.filter(m => m.roles.cache.size <= 1).size; // size 1 คือมีแค่ยศ @everyone

        const embed = new EmbedBuilder()
            .setTitle(`🔍 สรุปสถิติสมาชิกที่ไม่เคลื่อนไหว / สมาชิกเก่า`)
            .setColor(0xE67E22)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .setDescription(`รายงานข้อมูลสถิติตามระยะเวลาที่อยู่ในเซิร์ฟเวอร์ **${guild.name}**`)
            .addFields(
                { name: '👥 สมาชิกที่เป็นคนทั้งหมด', value: `\`${members.size}\` คน`, inline: false },
                { name: '❓ สมาชิกที่ไม่มี Roll ใดๆ (เสี่ยงบัญชีร้าง)', value: `\`${noRoleMembers}\` คน`, inline: false },
                { name: '📅 อยู่มาเกิน 1 เดือน (30+ วัน)', value: `\`${over30Days}\` คน`, inline: true },
                { name: '🗓️ อยู่มาเกิน 3 เดือน (90+ วัน)', value: `\`${over90Days}\` คน`, inline: true },
                { name: '⏳ อยู่มาเกิน 6 เดือน (180+ วัน)', value: `\`${over180Days}\` คน`, inline: true },
                { name: '🏆 อยู่มาเกิน 1 ปี (365+ วัน)', value: `\`${over365Days}\` คน`, inline: true }
            )
            .setFooter({ text: `เช็กโดย ${message.author.tag}` })
            .setTimestamp();

        await waitMsg.edit({ content: '✅ ตรวจสอบข้อมูลสำเร็จ!', embeds: [embed] });

    } catch (error) {
        console.error('Error in !status command:', error);
        await waitMsg.edit('❌ เกิดข้อผิดพลาดขณะดึงข้อมูลสมาชิก');
    }
});

client.login(TOKEN);
