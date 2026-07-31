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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;

// --------------------------------------------------
// 1. Slash Commands
// --------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('create-form-button')
        .setDescription('สร้างปุ่มกดเปิดแบบฟอร์ม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('รายละเอียด Embed').setRequired(true))
        .addStringOption(opt => opt.setName('button_label').setDescription('ชื่อบนปุ่มกด').setRequired(true))
        .addStringOption(opt => opt.setName('modal_title').setDescription('หัวข้อบนแบบฟอร์ม').setRequired(true))
        .addStringOption(opt => opt.setName('field1_label').setDescription('คำถามช่องที่ 1').setRequired(true))
        .addStringOption(opt => opt.setName('field2_label').setDescription('คำถามช่องที่ 2').setRequired(false))
        .addStringOption(opt => opt.setName('button_emoji').setDescription('อีโมจิบนปุ่ม').setRequired(false))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูป Banner').setRequired(false)),

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
        console.log('✅ อัปเดต Commands เรียบร้อย');
    } catch (error) {
        console.error('❌ Error:', error);
    }
});

// --------------------------------------------------
// 2. สั่งสร้างปุ่ม
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'create-form-button') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const buttonLabel = interaction.options.getString('button_label');
        const modalTitle = interaction.options.getString('modal_title');
        const field1Label = interaction.options.getString('field1_label');
        const field2Label = interaction.options.getString('field2_label') || '';
        const buttonEmoji = interaction.options.getString('button_emoji');
        const imageUrl = interaction.options.getString('image_url');

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0x5865F2)
            .setTimestamp();

        if (imageUrl) embed.setImage(imageUrl);

        // ตัดความยาว text ป้องกัน CustomId ล้น 100 อักษร
        const customIdData = JSON.stringify({
            mt: modalTitle.slice(0, 15),
            f1: field1Label.slice(0, 15),
            f2: field2Label.slice(0, 15)
        });

        const btn = new ButtonBuilder()
            .setCustomId(`custom_modal_${customIdData}`)
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Primary);

        if (buttonEmoji) btn.setEmoji(buttonEmoji);

        const row = new ActionRowBuilder().addComponents(btn);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ สร้างปุ่มเรียบร้อย!', ephemeral: true });
    }

    if (commandName === 'action') {
        if (ADMIN_CHANNEL_ID && interaction.channelId !== ADMIN_CHANNEL_ID) {
            return interaction.reply({ content: '❌ ใช้ได้เฉพาะห้องแอดมิน!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        const adminMenu = new StringSelectMenuBuilder()
            .setCustomId(`admin_select_${targetUser.id}_${encodeURIComponent(reason)}`)
            .setPlaceholder('เลือกรายการดำเนินการ...')
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
// 3. แก้ไขจุดนี้: ดักจับการกดปุ่มเดิม ให้เปิด Modal แบบฟอร์มขึ้นทันที
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('custom_modal_')) {
        try {
            const jsonString = interaction.customId.replace('custom_modal_', '');
            const data = JSON.parse(jsonString);

            const modal = new ModalBuilder()
                .setCustomId(`submit_custom_modal_${encodeURIComponent(data.mt)}`)
                .setTitle(data.mt || 'แบบฟอร์มส่งเรื่อง');

            const input1 = new TextInputBuilder()
                .setCustomId('input_field_1')
                .setLabel(data.f1 || 'รายละเอียด')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input1));

            if (data.f2) {
                const input2 = new TextInputBuilder()
                    .setCustomId('input_field_2')
                    .setLabel(data.f2)
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input2));
            }

            await interaction.showModal(modal);
        } catch (error) {
            // สำรองกรณีที่ปุ่มเดิมใช้ข้อมูล JSON ที่ยาวเกินจนพัง ให้แสดงฟอร์มมาตรฐานทันที
            const modal = new ModalBuilder()
                .setCustomId('submit_fallback_modal')
                .setTitle('📝 แบบฟอร์มส่งเรื่องร้องเรียน');

            const input1 = new TextInputBuilder()
                .setCustomId('input_field_1')
                .setLabel('ชื่อ / ID / ช่องทางติดต่อ')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const input2 = new TextInputBuilder()
                .setCustomId('input_field_2')
                .setLabel('รายละเอียดเรื่องที่ต้องการแจ้ง')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input1),
                new ActionRowBuilder().addComponents(input2)
            );

            await interaction.showModal(modal);
        }
    }
});

// --------------------------------------------------
// 4. รับข้อมูลจากแบบฟอร์มแล้วส่งเข้า Log
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId.startsWith('submit_custom_modal_') || interaction.customId === 'submit_fallback_modal') {
        const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

        const val1 = interaction.fields.getTextInputValue('input_field_1');
        let val2 = null;
        try {
            val2 = interaction.fields.getTextInputValue('input_field_2');
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setTitle('🚨 มีการส่งเรื่องร้องเรียนใหม่')
            .setColor(0xED4245)
            .addFields(
                { name: 'ผู้ส่งเรื่อง', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false },
                { name: 'ข้อมูลผู้แจ้ง / ช่องที่ 1', value: val1, inline: false }
            )
            .setTimestamp();

        if (val2) {
            embed.addFields({ name: 'รายละเอียด / ช่องที่ 2', value: val2, inline: false });
        }

        if (reportChannel) await reportChannel.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ ส่งข้อมูลให้ทีมงานเรียบร้อยแล้ว ขอบคุณครับ!', ephemeral: true });
    }
});

// --------------------------------------------------
// 5. ระบบ Dropdown แอดมิน
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId.startsWith('admin_select_')) {
        const [, , targetId, encodedReason] = interaction.customId.split('_');
        const reason = decodeURIComponent(encodedReason);
        const selectedValue = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

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
