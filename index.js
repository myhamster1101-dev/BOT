const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
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
// 1. ลงทะเบียน Slash Commands
// --------------------------------------------------
const commands = [
    // คำสั่งสร้างเมนู Dropdown ฝั่งผู้ใช้งาน
    new SlashCommandBuilder()
        .setName('setup-help-menu')
        .setDescription('สร้างเมนูตัวเลือกศูนย์ช่วยเหลือ (Select Menu)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด').setRequired(true))
        .addStringOption(opt => opt.setName('placeholder').setDescription('ข้อความแสดงบน Dropdown (เช่น 🎀 เลือกรายการ 🎀)').setRequired(true))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูป Banner (ถ้ามี)').setRequired(false)),

    // คำสั่งแอดมินจัดการสมาชิก
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
        console.log('✅ อัปเดต Slash Commands สำเร็จ!');
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

    // --- /setup-help-menu (สร้างเมนู Dropdown สวยๆ) ---
    if (commandName === 'setup-help-menu') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const placeholder = interaction.options.getString('placeholder');
        const imageUrl = interaction.options.getString('image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0xFFB6C1) // สีชมพูพาสเทล
            .setTimestamp();

        if (imageUrl) embed.setImage(imageUrl);

        // สร้าง Dropdown Menu เลือกรายการ
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('user_help_select')
            .setPlaceholder(placeholder) // ข้อความแสดงตรงกลางช่องเลือก
            .addOptions([
                {
                    label: '🚨 แจ้งปัญหาการใช้งาน',
                    description: 'แจ้งปัญหา ระบบขัดข้อง หรือข้อผิดพลาดต่างๆ',
                    value: 'select_report',
                    emoji: '🚨'
                },
                {
                    label: '💡 ส่งข้อเสนอแนะ',
                    description: 'เสนอแนะความคิดเห็นเพื่อพัฒนาเซิร์ฟเวอร์',
                    value: 'select_suggest',
                    emoji: '💡'
                },
                {
                    label: '⛔ รายงานบัญชีดำ',
                    description: 'รายงานผู้กระทำผิด / บัญชีดำโกงเงิน',
                    value: 'select_blacklist',
                    emoji: '⛔'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างเมนู Dropdown เรียบร้อยแล้ว!', ephemeral: true });
    }

    // --- /action (คำสั่งแอดมินจัดการผู้ใช้) ---
    if (commandName === 'action') {
        if (ADMIN_CHANNEL_ID && interaction.channelId !== ADMIN_CHANNEL_ID) {
            return interaction.reply({ content: '❌ สามารถใช้คำสั่งนี้ได้ในห้องแอดมินเท่านั้น!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        const adminMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_${targetUser.id}_${encodeURIComponent(reason)}`)
            .setPlaceholder('🎀 ༺ เลือกการดำเนินการ ༻ 🎀')
            .addOptions([
                { label: '⛔ ลงบัญชีดำ (Blacklist)', description: 'ประกาศลงช่องบัญชีดำทันที', value: 'type_blacklist', emoji: '⛔' },
                { label: '🔨 บทลงโทษ (Ban / Timeout)', description: 'เลือกระยะเวลาการ Timeout หรือ Ban', value: 'type_ban', emoji: '🔨' },
                { label: '📩 แจ้งเตือนข้อผิดพลาด (Report/DM)', description: 'ส่ง DM หาผู้ใช้ และบันทึกลงห้องกระทำผิด', value: 'type_report', emoji: '📩' },
            ]);

        const row = new ActionRowBuilder().addComponents(adminMenu);
        await interaction.reply({ 
            content: `🎯 **จัดการผู้ใช้:** <@${targetUser.id}>\n📝 **เหตุผล:** ${reason}`, 
            components: [row] 
        });
    }
});

// --------------------------------------------------
// 3. ประมวลผลเมื่อเลือก Dropdown
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    // --- 3.1 Dropdown ฝั่งผู้ใช้ (เด้ง Modal แบบฟอร์มขึ้นมา) ---
    if (interaction.customId === 'user_help_select') {
        const selected = interaction.values[0];

        if (selected === 'select_report') {
            const modal = new ModalBuilder().setCustomId('modal_report').setTitle('🚨 แบบฟอร์มแจ้งปัญหา');
            const input = new TextInputBuilder().setCustomId('detail').setLabel('รายละเอียดปัญหาที่พบ').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (selected === 'select_suggest') {
            const modal = new ModalBuilder().setCustomId('modal_suggest').setTitle('💡 แบบฟอร์มส่งข้อเสนอแนะ');
            const input = new TextInputBuilder().setCustomId('detail').setLabel('ข้อเสนอแนะของคุณ').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (selected === 'select_blacklist') {
            const modal = new ModalBuilder().setCustomId('modal_blacklist').setTitle('⛔ แบบฟอร์มรายงานบัญชีดำ');
            const target = new TextInputBuilder().setCustomId('target').setLabel('ชื่อ / ID / ข้อมูลผู้ถูกรายงาน').setStyle(TextInputStyle.Short).setRequired(true);
            const reason = new TextInputBuilder().setCustomId('reason').setLabel('เหตุผลและหลักฐานการโกง').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(target), new ActionRowBuilder().addComponents(reason));
            await interaction.showModal(modal);
        }
    }

    // --- 3.2 Dropdown ฝั่งแอดมิน ---
    if (interaction.customId.startsWith('admin_select_')) {
        const [, , targetId, encodedReason] = interaction.customId.split('_');
        const reason = decodeURIComponent(encodedReason);
        const selectedValue = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

        // เลือก Blacklist
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

        // เลือก Ban / Timeout (แสดง Dropdown เลือกระยะเวลาต่อ)
        if (selectedValue === 'type_ban') {
            const banSubMenu = new StringSelectMenuBuilder()
                .setCustomId(`sub_ban_${targetId}_${encodeURIComponent(reason)}`)
                .setPlaceholder('⏱️ เลือกระยะเวลาการลงโทษ...')
                .addOptions([
                    { label: '🔇 ปิดการพิมพ์/ไมค์ (Timeout 1 ชม.)', value: 'mute_1h', emoji: '⏱️' },
                    { label: '🔇 ปิดการพิมพ์/ไมค์ (Timeout 24 ชม.)', value: 'mute_24h', emoji: '⏳' },
                    { label: '⛔ แบนออกจากเซิร์ฟเวอร์ถาวร (Ban)', value: 'ban_perm', emoji: '🔨' }
                ]);

            const row = new ActionRowBuilder().addComponents(banSubMenu);
            await interaction.update({ content: `⚙️ เลือกระดับบทลงโทษสำหรับ <@${targetId}>:`, components: [row] });
        }

        // เลือก Report (ส่ง DM + ลงห้องกระทำผิด)
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
                console.log('ส่ง DM หาผู้ใช้ไม่สำเร็จ');
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

    // เมนูย่อยเลือกระยะเวลา Ban/Timeout
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

// --------------------------------------------------
// 4. ประมวลผลข้อมูลที่ผู้ใช้กรอกผ่าน Modal
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

    if (interaction.customId === 'modal_report' || interaction.customId === 'modal_suggest') {
        const isReport = interaction.customId === 'modal_report';
        const detail = interaction.fields.getTextInputValue('detail');

        const embed = new EmbedBuilder()
            .setTitle(isReport ? '🚨 มีรายการแจ้งปัญหาใหม่' : '💡 มีรายการข้อเสนอแนะใหม่')
            .setColor(isReport ? 0xFF0000 : 0x0099FF)
            .addFields(
                { name: 'ผู้ส่งเรื่อง', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: 'รายละเอียด', value: detail }
            )
            .setTimestamp();

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ข้อมูลถูกส่งเข้าสู่ระบบแอดมินเรียบร้อยแล้ว ขอบคุณครับ!', ephemeral: true });
    }

    if (interaction.customId === 'modal_blacklist') {
        const target = interaction.fields.getTextInputValue('target');
        const reason = interaction.fields.getTextInputValue('reason');

        const embed = new EmbedBuilder()
            .setTitle('⛔ มีรายงานบัญชีดำใหม่ (รอแอดมินตรวจสอบ)')
            .setColor(0x000000)
            .addFields(
                { name: 'ผู้ส่งรายงาน', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'ผู้ถูกรายงาน', value: target, inline: true },
                { name: 'เหตุผล/หลักฐาน', value: reason }
            )
            .setTimestamp();

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ส่งรายงานบัญชีดำเรียบร้อย แอดมินจะรีบดำเนินการตรวจสอบครับ!', ephemeral: true });
    }
});

client.login(TOKEN);
