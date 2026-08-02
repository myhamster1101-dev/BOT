// 🔘 --- คำสั่งสร้างปุ่มรับยศใส่ข้อความเดิม (ยืดหยุ่นสูง) ---
    new SlashCommandBuilder()
        .setName('setup_buttons')
        .setDescription('เพิ่มปุ่มกดรับยศใส่ข้อความเดิม (ส่งจากห้องไหนก็ได้)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('เลือกห้องที่ข้อความนั้นอยู่')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID ของข้อความเดิมที่ต้องการเพิ่มปุ่ม')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role1')
                .setDescription('ยศที่ 1')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('label1')
                .setDescription('ข้อความบนปุ่มที่ 1 (เช่น "รับยศสมาชิก")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('style1')
                .setDescription('สีปุ่มที่ 1')
                .setRequired(false)
                .addChoices(
                    { name: '🔵 สีน้ำเงิน (Primary)', value: 'Primary' },
                    { name: 'เพลน/เทา (Secondary)', value: 'Secondary' },
                    { name: '🟢 สีเขียว (Success)', value: 'Success' },
                    { name: '🔴 สีแดง (Danger)', value: 'Danger' }
                ))
        .addStringOption(option =>
            option.setName('emoji1')
                .setDescription('Emoji ปุ่มที่ 1 (เช่น ✨ หรือ 👑)')
                .setRequired(false))
        
        // --- ปุ่มที่ 2 (Optional) ---
        .addRoleOption(option => option.setName('role2').setDescription('ยศที่ 2').setRequired(false))
        .addStringOption(option => option.setName('label2').setDescription('ข้อความบนปุ่มที่ 2').setRequired(false))
        .addStringOption(option => option.setName('style2').setDescription('สีปุ่มที่ 2').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(option => option.setName('emoji2').setDescription('Emoji ปุ่มที่ 2').setRequired(false))

        // --- ปุ่มที่ 3 (Optional) ---
        .addRoleOption(option => option.setName('role3').setDescription('ยศที่ 3').setRequired(false))
        .addStringOption(option => option.setName('label3').setDescription('ข้อความบนปุ่มที่ 3').setRequired(false))
        .addStringOption(option => option.setName('style3').setDescription('สีปุ่มที่ 3').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(option => option.setName('emoji3').setDescription('Emoji ปุ่มที่ 3').setRequired(false))

        // --- รูป Banner (Optional) ---
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('ใส่ลิงก์รูปภาพ Banner ใน Embed (ถ้ามี)')
                .setRequired(false)),
