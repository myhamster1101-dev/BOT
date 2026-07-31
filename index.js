const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ดึงค่าจาก Environment Variables ใน Railway
const TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;

client.on('ready', () => {
    console.log(`🚀 บอทพร้อมทำงานแล้วในชื่อ: ${client.user.tag}`);
});

// 1. คำสั่งผูกปุ่มบอทเข้ากับ Embed ของ Discohook
// ใช้งาน: !attach_buttons <Channel_ID> <Message_ID>
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!attach_buttons')) return;
    if (!message.member.permissions.has('Administrator')) return;

    const args = message.content.split(' ');
    const channelId = args[1];
    const messageId = args[2];

    if (!channelId || !messageId) {
        return message.reply('❌ กรุณาระบุข้อมูลให้ครบ: `!attach_buttons <Channel_ID> <Message_ID>`');
    }

    try {
        const targetChannel = await client.channels.fetch(channelId);
        const targetMessage = await targetChannel.messages.fetch(messageId);

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

        await targetMessage.edit({ components: [row] });
        await message.reply('✅ ผูกปุ่มกดเข้ากับข้อความ Discohook เรียบร้อย!');
    } catch (err) {
        await message.reply(`❌ เกิดข้อผิดพลาด: ${err.message}`);
    }
});

// 2. คำสั่งแอดมินเปิดเมนูจัดการสมาชิก
// ใช้งาน (ในห้องแอดมิน): !action @user <เหตุผล>
client.on('messageCreate', async (message) => {
    if (ADMIN_CHANNEL_ID && message.channel.id !== ADMIN_CHANNEL_ID) return;
    if (!message.content.startsWith('!action')) return;
    if (!message.member.permissions.has('ModerateMembers')) return;

    const args = message.content.split(' ');
    const targetUser = message.mentions.users.first();
    const reason = args.slice(2).join(' ') || 'ไม่ได้ระบุเหตุผล';

    if (!targetUser) return message.reply('❌ กรุณาแท็กผู้ใช้ที่ต้องการจัดการ เช่น `!action @user เหตุผล`');

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
    await message.reply({ 
        content: `🎯 **จัดการผู้ใช้:** <@${targetUser.id}>\n📝 **เหตุผล:** ${reason}`, 
        components: [row] 
    });
});

// 3. ระบบประมวลผลการกดเมนู
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId.startsWith('admin_select_')) {
        const [, , targetId, encodedReason] = interaction.customId.split('_');
        const reason = decodeURIComponent(encodedReason);
        const selectedValue = interaction.values[0];
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

        if (!targetMember) return interaction.reply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์', ephemeral: true });

        // --- เคสที่ 1: บัญชีดำ (Blacklist) ---
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

        // --- เคสที่ 2: เมนูเลือกการแบน (Ban Menu) ---
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

        // --- เคสที่ 3: Report (DM + ส่งลงห้องกระทำผิด) ---
        if (selectedValue === 'type_report') {
            const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

            // ส่ง DM หาผู้ใช้
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ การแจ้งเตือนการกระทำผิด')
                    .setDescription(`คุณได้รับแจ้งเตือนจากทางทีมงาน **${interaction.guild.name}**`)
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

    // ประมวลผลตัวเลือกย่อยของการแบน (Sub Ban Menu)
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
});

client.login(TOKEN);
