const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    PermissionsBitField
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIX = '!';
const DB_FILE = path.join(__dirname, 'database.json');

// 🟢 ระบบฐานข้อมูลถาวร (บันทึกค่าลงไฟล์ ป้องกันปุ่ม/เมนูพังเมื่อรีบอท)
let db = {
    dotRoleConfigs: {},
    welcomeConfigs: {},
    boostConfigs: {},
    userBalances: {},
    shopItems: {},
    shopLogsConfig: {}
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
        } else {
            saveDatabase();
        }
    } catch (err) {
        console.error('❌ Error Loading Database:', err);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4), 'utf8');
    } catch (err) {
        console.error('❌ Error Saving Database:', err);
    }
}

loadDatabase();

function isValidHttpUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;  
    }
}

// 📌 ลงทะเบียน Slash Commands ครบถ้วน (13 Slash Commands)
const commands = [
    // 🛍️ หมวด 1: Shop & Topup
    new SlashCommandBuilder()
        .setName('setup-shop')
        .setDescription('ตั้งค่าห้องและส่งหน้าร้านค้าขายยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งหน้าร้านค้า').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบาย').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูป Banner ส่วนบน (Image)').setRequired(false))
        .addStringOption(opt => opt.setName('thumbnail_url').setDescription('ลิงก์รูปโลโก้เล็ก (Thumbnail)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('add-shop-item')
        .setDescription('เพิ่ม/แก้ไข ยศที่ต้องการขายและกำหนดราคา')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่ต้องการขาย').setRequired(true))
        .addIntegerOption(opt => opt.setName('price').setDescription('กำหนดราคา (บาท)').setRequired(true))
        .addIntegerOption(opt => opt.setName('stock').setDescription('จำนวนสต็อกสินค้า').setRequired(false))
        .addStringOption(opt => opt.setName('category').setDescription('หมวดหมู่สินค้า').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop-logs')
        .setDescription('ตั้งค่าห้อง Log เติมเงิน, Log ซื้อขาย และเบอร์/ชื่อบัญชีชำระเงิน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('topup_log').setDescription('เลือกห้อง Log เติมเงิน').setRequired(true))
        .addChannelOption(opt => opt.setName('shop_log').setDescription('เลือกห้อง Log ซื้อขาย').setRequired(true))
        .addStringOption(opt => opt.setName('promptpay').setDescription('เบอร์พร้อมเพย์/เลขบัญชี').setRequired(false))
        .addStringOption(opt => opt.setName('account_name').setDescription('ชื่อบัญชี (เช่น นาย สมชาย ใจดี)').setRequired(false))
        .addStringOption(opt => opt.setName('truewallet').setDescription('เบอร์ TrueMoney Wallet').setRequired(false)),

    // 🎭 หมวด 2: Role Systems
    new SlashCommandBuilder()
        .setName('setup_dropdown')
        .setDescription('เพิ่ม Dropdown เลือกกดรับยศไม่จำกัด (ใส่ ID คั่นด้วย ,)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่ง Dropdown').setRequired(true))
        .addStringOption(opt => opt.setName('role_ids').setDescription('ไอดี ยศ คั่นด้วยจุลภาค (เช่น 123456,789012)').setRequired(true))
        .addStringOption(opt => opt.setName('placeholder').setDescription('ข้อความแสดงบน Dropdown').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup_buttons')
        .setDescription('เพิ่มปุ่มกดรับยศใส่ข้อความเดิม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องที่ต้องการเพิ่มปุ่ม').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่ต้องการแจก').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('ข้อความบนปุ่มกด').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-dot-role')
        .setDescription('ตั้งค่าห้องพิมพ์จุด (.) เพื่อรับยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้อง').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศ').setRequired(true))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูป Banner').setRequired(false)),

    // 🎉 หมวด 3: Welcome & Boost
    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('ตั้งค่าห้องและข้อความต้อนรับคนเข้าดิส')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องต้อนรับ').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('ยศที่จะแจกให้อัตโนมัติ').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์ Banner ต้อนรับ').setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-welcome')
        .setDescription('ทดสอบการทำงานระบบต้อนรับ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-boost')
        .setDescription('ตั้งค่าห้องขอบคุณคน Boost เซิร์ฟเวอร์')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องแจ้งเตือน Boost').setRequired(true)),

    new SlashCommandBuilder()
        .setName('test-boost')
        .setDescription('ทดสอบส่งข้อความแจ้งเตือน Boost')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // 🎟️ หมวด 4: Management
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('สร้างปุ่มกดเปิดตั๋วร้องเรียน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งปุ่ม Ticket').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('สร้างปุ่มรายงานผู้กระทำผิด')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งปุ่ม Report').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('แผงควบคุมลงโทษ/จัดการผู้ใช้')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งแผงควบคุม').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์พร้อมใช้งาน: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Synchronized All 13 Slash Commands Successfully!');
    } catch (error) {
        console.error('❌ Synchronize Commands Failed:', error);
    }
});

// 🛠️ การ์ดต้อนรับ
async function sendWelcomeCard(channel, member, role, bannerUrl = null) {
    const embed = new EmbedBuilder()
        .setTitle('🎉 ยินดีต้อนรับสมาชิกใหม่!')
        .setColor('#2ECC71')
        .setDescription(`✨ ยินดีต้อนรับคุณ <@${member.id}> เข้าสู่เซิร์ฟเวอร์!\nระบบได้ทำการมอบยศให้เรียบร้อยแล้วครับ ✅`)
        .addFields(
            { name: '🏷️ ยศที่ได้รับ', value: role ? `<@&${role.id}>` : '`ไม่มีการมอบยศ`', inline: true },
            { name: '📌 สถานะ', value: '`สำเร็จเรียบร้อย`', inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `${member.guild.name} • ระบบรับยศอัตโนมัติ` });

    if (bannerUrl && isValidHttpUrl(bannerUrl)) {
        embed.setImage(bannerUrl);
    }

    const outsideMessage = role ? `<@&${role.id}> ✨ <@${member.id}> ได้รับยศเรียบร้อยแล้ว!` : `✨ <@${member.id}> ยินดีต้อนรับสู่เซิร์ฟเวอร์!`;
    await channel.send({ content: outsideMessage, embeds: [embed] }).catch(() => null);
}

// 🔴 สมาชิกใหม่เข้าดิสคอร์ด
client.on('guildMemberAdd', async (member) => {
    const wCfg = db.welcomeConfigs[member.guild.id];
    if (!wCfg) return;

    const ch = member.guild.channels.cache.get(wCfg.channelId);
    if (!ch) return;

    let role = wCfg.roleId ? member.guild.roles.cache.get(wCfg.roleId) : null;
    if (role) await member.roles.add(role).catch(() => null);

    await sendWelcomeCard(ch, member, role, wCfg.bannerUrl);
});

// 🔴 Prefix Commands (!status, !botsetup) และระบบพิมพ์จุด (.)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // ระบบพิมพ์จุด (.) เพื่อรับยศ
    const dotCfg = db.dotRoleConfigs[message.guild.id];
    if (dotCfg && message.channel.id === dotCfg.channelId) {
        const content = message.content.trim();
        if (content === '.' || content === '!') {
            const role = message.guild.roles.cache.get(dotCfg.roleId);
            if (role) {
                if (!message.member.roles.cache.has(role.id)) {
                    await message.member.roles.add(role).catch(() => null);
                    await sendWelcomeCard(message.channel, message.member, role, dotCfg.bannerUrl);
                } else {
                    await message.reply(`💡 คุณมียศ **${role.name}** อยู่แล้ว`).catch(() => null);
                }
            }
            return;
        }
    }

    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 14. !botsetup
    if (command === 'botsetup') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 คู่มือการตั้งค่าและคำสั่งทั้งหมดของบอท (Bot Setup Manual)')
            .setColor('#3498DB')
            .setDescription('รวมคำสั่งสำหรับแอดมินในการตั้งค่าระบบต่างๆ ในเซิร์ฟเวอร์ด้วย Slash Commands ( `/` ) และ Prefix Commands ( `!` )')
            .addFields(
                { name: '🛍️ ระบบร้านค้าขายยศ & เติมเงิน (Shop & Topup)', value: '• `/setup-shop` : ตั้งค่าห้องและส่งหน้าร้านค้าขายยศ\n• `/add-shop-item` : เพิ่ม/แก้ไข ยศที่ต้องการขายและกำหนดราคา\n• `/setup-shop-logs` : ตั้งค่าห้อง Log เติมเงิน, Log ซื้อขาย และเบอร์/ชื่อบัญชีชำระเงิน' },
                { name: '🎭 ระบบรับยศอัตโนมัติ (Role Systems)', value: '• `/setup_dropdown` : เพิ่ม Dropdown เลือกกดรับยศไม่จำกัด (ใส่ ID คั่นด้วย `,`)\n• `/setup_buttons` : เพิ่มปุ่มกดรับยศใส่ข้อความเดิม\n• `/setup-dot-role` : ตั้งค่าห้องพิมพ์จุด (`.`) เพื่อรับยศ' },
                { name: '🎉 ระบบต้อนรับ & แจ้งเตือน (Welcome & Boost)', value: '• `/setup-welcome` : ตั้งค่าห้องและข้อความต้อนรับคนเข้าดิส\n• `/test-welcome` : ทดสอบการทำงานระบบต้อนรับ\n• `/setup-boost` : ตั้งค่าห้องขอบคุณคน Boost เซิร์ฟเวอร์\n• `/test-boost` : ทดสอบส่งข้อความแจ้งเตือน Boost' },
                { name: '🎟️ ระบบ Ticket & แจ้งเรื่อง (Management)', value: '• `/setup-ticket` : สร้างปุ่มกดเปิดตั๋วร้องเรียน\n• `/setup-report` : สร้างปุ่มรายงานผู้กระทำผิด\n• `/setup-admin` : แผงควบคุมลงโทษ/จัดการผู้ใช้' },
                { name: '📊 คำสั่งทั่วไป & จัดการเซิร์ฟเวอร์', value: '• `!status` : เช็กรายชื่อคนไม่มียศ\n• `!botsetup` : เปิดดูคู่มือแผงตั้งค่านิ้' }
            )
            .setFooter({ text: 'IDLE HOURS 🏠 • Bot Configuration' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // 15. !status
    if (command === 'status') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        await message.guild.members.fetch();
        const noRoleMembers = message.guild.members.cache.filter(m => m.roles.cache.size <= 1 && !m.user.bot);

        const embed = new EmbedBuilder()
            .setTitle('📊 รายชื่อสมาชิกที่ไม่มียศในเซิร์ฟเวอร์')
            .setColor('#E74C3C')
            .setDescription(noRoleMembers.size > 0 ? noRoleMembers.map(m => `• <@${m.id}> (\`${m.user.tag}\`)`).join('\n').slice(0, 4000) : '🎉 ทุกคนในเซิร์ฟเวอร์มียศเรียบร้อยแล้ว!')
            .setFooter({ text: `จำนวนคนไม่มียศทั้งหมด: ${noRoleMembers.size} คน` });

        return message.reply({ embeds: [embed] });
    }
});

// 🔴 Interaction Router
client.on('interactionCreate', async (interaction) => {
    try {
        // --- 1. SLASH COMMANDS ---
        if (interaction.isChatInputCommand()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            // 1. /setup-shop
            if (interaction.commandName === 'setup-shop') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'เลือกซื้อยศที่คุณต้องการได้จากเมนูด้านล่างนี้';
                const bannerUrl = interaction.options.getString('banner_url');
                const thumbnailUrl = interaction.options.getString('thumbnail_url');

                const shopEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setColor('#2ECC71')
                    .setDescription(description)
                    .setTimestamp();

                if (bannerUrl && isValidHttpUrl(bannerUrl)) shopEmbed.setImage(bannerUrl);
                if (thumbnailUrl && isValidHttpUrl(thumbnailUrl)) shopEmbed.setThumbnail(thumbnailUrl);

                const items = db.shopItems[interaction.guild.id] || [];
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_buy_shop_role')
                    .setPlaceholder('🛒 เลือกซื้อยศที่ต้องการ...');

                if (items.length > 0) {
                    items.forEach(item => {
                        const role = interaction.guild.roles.cache.get(item.roleId);
                        if (role) {
                            selectMenu.addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(`${role.name} - ${item.price} บาท`)
                                    .setValue(role.id)
                                    .setDescription(`หมวดหมู่: ${item.category} | สต็อก: ${item.stock}`)
                            );
                        }
                    });
                } else {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('ยังไม่มีสินค้า')
                            .setValue('none')
                            .setDescription('โปรดเพิ่มยศผ่าน /add-shop-item')
                    );
                }

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_topup_truemoney').setLabel('🧧 เติมเงิน TrueMoney').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_topup_promptpay').setLabel('📲 เติมเงิน PromptPay').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_check_bal').setLabel('💰 เช็กยอดเงิน').setStyle(ButtonStyle.Secondary)
                );

                const menuRow = new ActionRowBuilder().addComponents(selectMenu);

                await channel.send({ embeds: [shopEmbed], components: [menuRow, btnRow] });
                return await interaction.editReply({ content: `✅ สร้างหน้าร้านค้าในช่อง <#${channel.id}> เรียบร้อยแล้ว!` });
            }

            // 2. /add-shop-item
            if (interaction.commandName === 'add-shop-item') {
                const role = interaction.options.getRole('role');
                const price = interaction.options.getInteger('price');
                const stock = interaction.options.getInteger('stock') || 999;
                const category = interaction.options.getString('category') || 'ทั่วไป';

                db.shopItems[interaction.guild.id] = db.shopItems[interaction.guild.id] || [];
                
                const existingIdx = db.shopItems[interaction.guild.id].findIndex(i => i.roleId === role.id);
                if (existingIdx !== -1) {
                    db.shopItems[interaction.guild.id][existingIdx] = { roleId: role.id, price, stock, category };
                } else {
                    db.shopItems[interaction.guild.id].push({ roleId: role.id, price, stock, category });
                }
                saveDatabase();

                return await interaction.editReply({ content: `✅ ตั้งค่าราคาขายยศ **${role.name}** ราคา **${price}** บาท เรียบร้อยแล้ว!` });
            }

            // 3. /setup-shop-logs
            if (interaction.commandName === 'setup-shop-logs') {
                const topupLog = interaction.options.getChannel('topup_log');
                const shopLog = interaction.options.getChannel('shop_log');
                const promptpay = interaction.options.getString('promptpay') || 'ไม่ระบุ';
                const accountName = interaction.options.getString('account_name') || 'ไม่ระบุ';
                const truewallet = interaction.options.getString('truewallet') || 'ไม่ระบุ';

                db.shopLogsConfig[interaction.guild.id] = { 
                    topupLogId: topupLog.id, 
                    shopLogId: shopLog.id, 
                    promptpay, 
                    accountName, 
                    truewallet 
                };
                saveDatabase();

                return await interaction.editReply({ content: '✅ บันทึกช่อง Log และข้อมูลบัญชีชำระเงินเรียบร้อยแล้ว!' });
            }

            // 4. /setup_dropdown
            if (interaction.commandName === 'setup_dropdown') {
                const channel = interaction.options.getChannel('channel');
                const rawIds = interaction.options.getString('role_ids');
                const placeholder = interaction.options.getString('placeholder') || '🎭 เลือกยศที่คุณต้องการที่นี่...';

                const roleIds = rawIds.split(',').map(id => id.trim());
                const selectMenu = new StringSelectMenuBuilder().setCustomId('select_custom_roles').setPlaceholder(placeholder);

                roleIds.forEach(id => {
                    const role = interaction.guild.roles.cache.get(id);
                    if (role) {
                        selectMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(role.name).setValue(role.id));
                    }
                });

                await channel.send({ content: '👇 **เลือกรับยศประจำตัวของคุณได้ที่เมนูด้านล่าง:**', components: [new ActionRowBuilder().addComponents(selectMenu)] });
                return await interaction.editReply({ content: `✅ ส่ง Dropdown เลือกรับยศสำเร็จ!` });
            }

            // 5. /setup_buttons
            if (interaction.commandName === 'setup_buttons') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const label = interaction.options.getString('label') || role.name;

                const btn = new ButtonBuilder().setCustomId(`btn_role_${role.id}`).setLabel(label).setStyle(ButtonStyle.Primary);
                await channel.send({ content: `กดปุ่มด้านล่างเพื่อรับยศ <@&${role.id}>`, components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ เพิ่มปุ่มรับยศสำเร็จ!` });
            }

            // 6. /setup-dot-role
            if (interaction.commandName === 'setup-dot-role') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url');

                db.dotRoleConfigs[interaction.guild.id] = { channelId: channel.id, roleId: role.id, bannerUrl };
                saveDatabase();

                const embed = new EmbedBuilder().setTitle('🔴 ระบบพิมพ์จุด (.) เพื่อรับยศ').setColor('#E74C3C').setDescription(`พิมพ์จุด \`.\` ในช่องนี้เพื่อรับยศ <@&${role.id}> อัตโนมัติ!`);
                if (bannerUrl && isValidHttpUrl(bannerUrl)) embed.setImage(bannerUrl);

                await channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: `✅ ตั้งค่าระบบพิมพ์จุดสำเร็จ!` });
            }

            // 7. /setup-welcome
            if (interaction.commandName === 'setup-welcome') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url');

                db.welcomeConfigs[interaction.guild.id] = { channelId: channel.id, roleId: role ? role.id : null, bannerUrl };
                saveDatabase();

                return await interaction.editReply({ content: `✅ ตั้งค่าระบบต้อนรับเรียบร้อย!` });
            }

            // 8. /test-welcome
            if (interaction.commandName === 'test-welcome') {
                const wCfg = db.welcomeConfigs[interaction.guild.id];
                const role = wCfg?.roleId ? interaction.guild.roles.cache.get(wCfg.roleId) : interaction.member.roles.highest;
                await sendWelcomeCard(interaction.channel, interaction.member, role, wCfg?.bannerUrl);
                return await interaction.editReply({ content: '✅ ทดสอบส่งข้อความต้อนรับสำเร็จ!' });
            }

            // 9. /setup-boost
            if (interaction.commandName === 'setup-boost') {
                const channel = interaction.options.getChannel('channel');
                db.boostConfigs[interaction.guild.id] = { channelId: channel.id };
                saveDatabase();
                return await interaction.editReply({ content: `✅ ตั้งค่าห้องแจ้งเตือน Boost สำเร็จ!` });
            }

            // 10. /test-boost
            if (interaction.commandName === 'test-boost') {
                const embed = new EmbedBuilder().setTitle('🚀 ขอบคุณสำหรับการ Boost เซิร์ฟเวอร์!').setColor('#F47FFF').setDescription(`ขอบคุณ <@${interaction.user.id}> ที่ช่วย Boost เซิร์ฟเวอร์ให้เรา! 💖`);
                await interaction.channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✅ ทดสอบส่งข้อความ Boost สำเร็จ!' });
            }

            // 11. /setup-ticket
            if (interaction.commandName === 'setup-ticket') {
                const channel = interaction.options.getChannel('channel');
                const embed = new EmbedBuilder().setTitle('📩 ระบบตั๋วร้องเรียน / ติดต่อสอบถาม').setColor('#3498DB').setDescription('หากพบปัญหา ติดต่อทีมงาน กดปุ่มเปิดตั๋วด้านล่างได้เลยครับ');
                const btn = new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('📩 เปิดตั๋วติดต่อแอดมิน').setStyle(ButtonStyle.Success);
                await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ สร้างระบบ Ticket สำเร็จ!` });
            }

            // 12. /setup-report
            if (interaction.commandName === 'setup-report') {
                const channel = interaction.options.getChannel('channel');
                const embed = new EmbedBuilder().setTitle('🚨 ระบบรายงานผู้กระทำผิด').setColor('#E74C3C').setDescription('หากพบผู้เล่นทำผิดกฎ กดปุ่มด้านล่างเพื่อแจ้งทีมงานทันที');
                const btn = new ButtonBuilder().setCustomId('btn_open_report').setLabel('🚨 แจ้งผู้ทำผิดกฎ').setStyle(ButtonStyle.Danger);
                await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ สร้างระบบ Report สำเร็จ!` });
            }

            // 13. /setup-admin
            if (interaction.commandName === 'setup-admin') {
                const channel = interaction.options.getChannel('channel');
                const embed = new EmbedBuilder().setTitle('⚙️ แผงควบคุมแอดมิน').setColor('#9B59B6').setDescription('จัดการระบบการเงินสมาชิกภายในเซิร์ฟเวอร์');
                const btn = new ButtonBuilder().setCustomId('btn_admin_give_money').setLabel('🪄 เสกเงิน / เพิ่มเครดิต').setStyle(ButtonStyle.Danger);
                await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ สร้างแผงควบคุมแอดมินสำเร็จ!` });
            }
        }

        // --- 2. BUTTON INTERACTIONS ---
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('btn_role_')) {
                const roleId = interaction.customId.replace('btn_role_', '');
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return await interaction.reply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์', ephemeral: true });

                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role).catch(() => null);
                    return await interaction.reply({ content: `❌ ถอดยศ **${role.name}** ออกเรียบร้อยแล้ว`, ephemeral: true });
                } else {
                    await interaction.member.roles.add(role).catch(() => null);
                    return await interaction.reply({ content: `✅ มอบยศ **${role.name}** ให้เรียบร้อยแล้ว!`, ephemeral: true });
                }
            }

            if (interaction.customId === 'btn_close_ticket') {
                await interaction.reply({ content: '🔒 กำลังปิดและลบห้องตั๋วนี้ใน 3 วินาที...' });
                setTimeout(() => interaction.channel.delete().catch(() => null), 3000);
                return;
            }

            if (interaction.customId === 'btn_check_bal' || interaction.customId === 'btn_check_balance') {
                const bal = db.userBalances[interaction.user.id] || 0;
                return await interaction.reply({ content: `💰 ยอดเงินคงเหลือของคุณคือ: **${bal}** บาท`, ephemeral: true });
            }

            if (interaction.customId === 'btn_topup_truemoney') {
                const modal = new ModalBuilder().setCustomId('modal_topup_truemoney').setTitle('🧧 เติมเงิน TrueMoney Wallet');
                const input = new TextInputBuilder().setCustomId('input_voucher_link').setLabel('กรอกลิงก์ซองของขวัญ TrueMoney').setStyle(TextInputStyle.Short).setPlaceholder('https://gift.truemoney.com/v1/?v=...').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_promptpay') {
                const cfg = db.shopLogsConfig[interaction.guild.id];
                const embed = new EmbedBuilder()
                    .setTitle('📲 ข้อมูลการชำระเงินผ่าน PromptPay')
                    .setColor('#3498DB')
                    .setDescription(
                        `💳 **พร้อมเพย์/เลขบัญชี:** \`${cfg?.promptpay || 'กรุณาสอบถามแอดมิน'}\`\n` +
                        `👤 **ชื่อบัญชี:** \`${cfg?.accountName || 'กรุณาสอบถามแอดมิน'}\`\n` +
                        `🧧 **TrueWallet:** \`${cfg?.truewallet || 'กรุณาสอบถามแอดมิน'}\`\n\n` +
                        `เมื่อโอนเงินสำเร็จ แจ้งสลิปกับแอดมินทางตั๋วเพื่อเติมเครดิตครับ`
                    );
                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (interaction.customId === 'btn_admin_give_money') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานปุ่มนี้', ephemeral: true });
                }

                const modal = new ModalBuilder().setCustomId('modal_admin_give_money').setTitle('🪄 เสกเงิน/เพิ่มเครดิตให้สมาชิก');
                const userInput = new TextInputBuilder().setCustomId('input_target_id').setLabel('User ID ของผู้รับเงิน').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('input_amount').setLabel('จำนวนเงิน (บาท)').setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(userInput), new ActionRowBuilder().addComponents(amountInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_open_ticket' || interaction.customId === 'btn_open_report') {
                const isReport = interaction.customId === 'btn_open_report';
                const createdChannel = await interaction.guild.channels.create({
                    name: `${isReport ? 'report' : 'ticket'}-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const embed = new EmbedBuilder()
                    .setTitle(isReport ? '🚨 ตั๋วแจ้งรายงานผู้กระทำผิด' : '📩 ตั๋วติดต่อทีมงาน')
                    .setColor(isReport ? '#E74C3C' : '#3498DB')
                    .setDescription(`สวัสดีครับ <@${interaction.user.id}> กรุณากรอกรายละเอียดเรื่องที่ต้องการแจ้งได้เลยครับ`);

                const closeBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('🔒 ปิดตั๋วนี้').setStyle(ButtonStyle.Danger)
                );

                await createdChannel.send({ embeds: [embed], components: [closeBtn] });
                return await interaction.reply({ content: `✅ สร้างห้องเปิดตั๋วเรียบร้อยแล้วที่ ${createdChannel}`, ephemeral: true });
            }
        }

        // --- 3. SELECT MENUS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_buy_shop_role') {
                const roleId = interaction.values[0];
                if (roleId === 'none') return await interaction.reply({ content: '❌ ยังไม่มีสินค้าพร้อมจำหน่าย', ephemeral: true });

                const items = db.shopItems[interaction.guild.id] || [];
                const shopItem = items.find(i => i.roleId === roleId);

                if (!shopItem) return await interaction.reply({ content: '❌ ไม่พบสินค้านี้ในระบบ', ephemeral: true });

                const userBal = db.userBalances[interaction.user.id] || 0;
                if (userBal < shopItem.price) {
                    return await interaction.reply({ content: `❌ ยอดเงินไม่พอ! ยศนี้ราคา **${shopItem.price}** บาท คุณมีเงิน **${userBal}** บาท`, ephemeral: true });
                }

                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return await interaction.reply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์', ephemeral: true });

                db.userBalances[interaction.user.id] -= shopItem.price;
                saveDatabase();

                await interaction.member.roles.add(role).catch(() => null);

                const shopCfg = db.shopLogsConfig[interaction.guild.id];
                if (shopCfg?.shopLogId) {
                    const logCh = interaction.guild.channels.cache.get(shopCfg.shopLogId);
                    if (logCh) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛍️ สถิติการซื้อสินค้าใหม่')
                            .setColor('#2ECC71')
                            .addFields(
                                { name: '👤 ผู้ซื้อ', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                                { name: '🏷️ สินค้าที่ซื้อ', value: `<@&${role.id}>`, inline: true },
                                { name: '💵 ราคา', value: `\`${shopItem.price}\` บาท`, inline: true }
                            )
                            .setTimestamp();
                        await logCh.send({ embeds: [logEmbed] }).catch(() => null);
                    }
                }

                return await interaction.reply({ content: `🎉 **ซื้อยศสำเร็จ!** มอบยศ **${role.name}** ให้คุณเรียบร้อย หักเงิน **${shopItem.price}** บาท`, ephemeral: true });
            }

            if (interaction.customId === 'select_custom_roles') {
                const roleId = interaction.values[0];
                const role = interaction.guild.roles.cache.get(roleId);

                if (!role) return await interaction.reply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์', ephemeral: true });

                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role).catch(() => null);
                    return await interaction.reply({ content: `❌ ถอดยศ **${role.name}** เรียบร้อยแล้ว`, ephemeral: true });
                } else {
                    await interaction.member.roles.add(role).catch(() => null);
                    return await interaction.reply({ content: `🎉 มอบยศ **${role.name}** ให้เรียบร้อยแล้ว!`, ephemeral: true });
                }
            }
        }

        // --- 4. MODALS SUBMIT ---
        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            if (interaction.customId === 'modal_admin_give_money') {
                const targetId = interaction.fields.getTextInputValue('input_target_id').trim();
                const amount = parseInt(interaction.fields.getTextInputValue('input_amount').trim(), 10);

                if (isNaN(amount) || amount <= 0) return await interaction.editReply({ content: '❌ กรุณากรอกตัวเลขจำนวนเงินให้ถูกต้อง' });

                db.userBalances[targetId] = (db.userBalances[targetId] || 0) + amount;
                saveDatabase();

                return await interaction.editReply({ content: `🪄 **เสกเงินสำเร็จ!** เพิ่มเครดิต **${amount}** บาท ให้แก่ <@${targetId}> เรียบร้อยแล้ว (ยอดเงินคงเหลือ: ${db.userBalances[targetId]} บาท)` });
            }

            if (interaction.customId === 'modal_topup_truemoney') {
                const voucherUrl = interaction.fields.getTextInputValue('input_voucher_link').trim();

                const shopCfg = db.shopLogsConfig[interaction.guild.id];
                if (shopCfg?.topupLogId) {
                    const logCh = interaction.guild.channels.cache.get(shopCfg.topupLogId);
                    if (logCh) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🧧 แจ้งส่งซองเติมเงิน TrueMoney')
                            .setColor('#F1C40F')
                            .addFields(
                                { name: '👤 ผู้ส่ง', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                                { name: '🔗 ลิงก์ซอง', value: `\`\`\`${voucherUrl}\`\`\`` }
                            )
                            .setTimestamp();
                        await logCh.send({ embeds: [logEmbed] }).catch(() => null);
                    }
                }

                return await interaction.editReply({ content: `📩 **ส่งลิงก์ซองของขวัญเรียบร้อยแล้ว!**\n\`${voucherUrl}\` (ระบบบันทึกข้อมูลเข้าห้อง Log เพื่อตรวจสอบเรียบร้อยแล้วครับ)` });
            }
        }

    } catch (err) {
        console.error('Interaction Handling Error:', err);
    }
});

client.login(TOKEN);
