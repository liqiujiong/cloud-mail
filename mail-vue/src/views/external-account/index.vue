<template>
  <div class="external-account-page">
    <div class="header-actions">
      <Icon v-perm="'external-account:add'" class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <Icon v-perm="'external-account:add'" class="icon" icon="solar:import-outline" width="21" height="21" @click="openImport"/>
      <Icon v-perm="'external-account:query'" class="icon" :class="{disabled: selectedAccounts.length === 0}" icon="ion:download-outline" width="20" height="20" @click="exportSelected"/>
      <Icon v-perm="'external-account:sync'" class="icon" :class="{disabled: selectedAccounts.length === 0 || batchSyncing, syncing: batchSyncing}" icon="ion:sync-outline" width="19" height="19" @click="syncSelectedAccounts"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="loadList"/>
      <el-input
          v-model="emailKeyword"
          class="keyword-input"
          placeholder="模糊搜索邮箱"
          clearable
          @keyup.enter="loadList"
          @clear="loadList"
      />
      <Icon
          class="icon favorite-filter"
          :icon="favertiveOnly ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
          width="20"
          height="20"
          @click="toggleFavertiveFilter"
      />
      <el-input
          v-model="remarkKeyword"
          class="remark-input"
          placeholder="搜索备注"
          clearable
          @keyup.enter="loadList"
          @clear="loadList"
      />
      <el-date-picker
          v-model="createTimeRange"
          class="create-time-range"
          type="daterange"
          unlink-panels
          start-placeholder="添加开始"
          end-placeholder="添加结束"
          @change="loadList"
      />
      <el-input
          v-model="ownerEmail"
          class="owner-select"
          placeholder="归属用户"
          clearable
          @keyup.enter="loadList"
          @clear="loadList"
      />
    </div>
    <el-scrollbar class="table-scrollbar">
      <el-table :data="accounts" v-loading="loading" style="height: 100%" :empty-text="''" @selection-change="selectedAccounts = $event">
        <el-table-column type="selection" width="45"/>
        <el-table-column label="收藏" width="70">
          <template #default="props">
            <Icon
                class="star-icon"
                :icon="props.row.isFavertive ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
                width="19"
                height="19"
                @click="toggleFavertive(props.row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="name" min-width="140"/>
        <el-table-column label="邮箱" prop="email" min-width="210"/>
        <el-table-column label="备注" prop="remark" min-width="150"/>
        <el-table-column label="协议" width="90">
          <template #default="props">
            <el-tag :type="props.row.protocol === 'IMAP' ? 'success' : 'warning'">{{ props.row.protocol }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服务器" min-width="190">
          <template #default="props">
            <span>{{ serverText(props.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="代理" min-width="150">
          <template #default="props">
            <span>{{ proxyText(props.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="props">
            <el-tag :type="props.row.status === 'normal' ? 'success' : 'danger'">{{ statusText(props.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="归属用户" prop="ownerEmail" min-width="180"/>
        <el-table-column label="最近同步" min-width="170">
          <template #default="props">
            <div class="sync-result">
              <span>{{ formatSyncTime(props.row.lastSyncTime) }}</span>
              <span v-if="props.row.lastSyncResult">{{ props.row.lastSyncResult }}</span>
              <span v-if="props.row.lastErrorCode" class="error">{{ props.row.lastErrorCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邮件数量" width="100">
          <template #default="props">
            <span>{{ props.row.mailCount || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="245" fixed="right">
          <template #default="props">
            <div class="row-actions">
              <el-button v-perm="'external-account:test'" size="small" :loading="testingId === props.row.externalAccountId" @click="testAccount(props.row)">测试</el-button>
              <el-button v-perm="'external-account:sync'" size="small" type="primary" :loading="syncingId === props.row.externalAccountId" @click="syncAccount(props.row)">同步</el-button>
              <el-dropdown trigger="click">
                <el-button size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-perm="'external-account:set'" @click="openEdit(props.row)">编辑</el-dropdown-item>
                    <el-dropdown-item v-perm="'external-account:sync'" @click="syncAccountAll(props.row)">全量同步</el-dropdown-item>
                    <el-dropdown-item v-perm="'external-account:delete'" @click="deleteAccount(props.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-scrollbar>

    <el-dialog v-model="formShow" :title="form.externalAccountId ? '编辑外部邮箱' : '添加外部邮箱'" width="620px" @closed="resetForm">
      <el-form label-width="110px" class="account-form">
        <el-form-item label="邮箱地址">
          <el-input v-model="form.email" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="协议">
          <el-segmented v-model="form.protocol" :options="['IMAP', 'POP3']"/>
        </el-form-item>
        <template v-if="form.protocol === 'IMAP'">
          <el-form-item label="IMAP Host">
            <el-input v-model="form.imapHost" autocomplete="off" placeholder="输入邮箱地址后自动匹配预设配置"/>
          </el-form-item>
          <el-form-item label="IMAP Port">
            <el-input-number v-model="form.imapPort" :min="1" :max="65535"/>
            <el-checkbox v-model="form.imapSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
          <el-form-item label="文件夹">
            <el-input v-model="form.imapMailbox" autocomplete="off"/>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="POP3 Host">
            <el-input v-model="form.popHost" autocomplete="off" placeholder="输入邮箱地址后自动匹配预设配置"/>
          </el-form-item>
          <el-form-item label="POP3 Port">
            <el-input-number v-model="form.popPort" :min="1" :max="65535"/>
            <el-checkbox v-model="form.popSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
        </template>
        <el-form-item label="邮箱密码">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password"/>
        </el-form-item>
        <el-divider>SOCKS5 代理</el-divider>
        <el-form-item label="代理 Host">
          <el-input v-model="form.proxyHost" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="代理 Port">
          <el-input-number v-model="form.proxyPort" :min="0" :max="65535"/>
        </el-form-item>
        <el-form-item label="代理用户名">
          <el-input v-model="form.proxyUsername" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="代理密码">
          <el-input v-model="form.proxyPassword" type="password" show-password autocomplete="new-password"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formShow = false">取消</el-button>
        <el-button v-perm="'external-account:test'" :loading="testSaving" @click="testForm">测试连接</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importShow" title="批量导入外部邮箱" width="680px" @closed="resetImportForm">
      <el-alert
          class="import-tip"
          type="info"
          show-icon
          :closable="false"
          title="每行一个账号，格式：邮箱----密码----SOCKS5代理。已存在账号会更新；代理格式：用户名:密码@host:端口；代理可留空。"
      />
      <el-form label-width="110px" class="account-form import-form">
        <el-form-item label="协议">
          <el-segmented v-model="importForm.protocol" :options="['IMAP', 'POP3']"/>
        </el-form-item>
        <template v-if="importForm.protocol === 'IMAP'">
          <el-form-item label="IMAP Host">
            <el-input v-model="importForm.imapHost" autocomplete="off" placeholder="留空则按邮箱域名匹配预设配置"/>
          </el-form-item>
          <el-form-item label="IMAP Port">
            <el-input-number v-model="importForm.imapPort" :min="1" :max="65535"/>
            <el-checkbox v-model="importForm.imapSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
          <el-form-item label="文件夹">
            <el-input v-model="importForm.imapMailbox" autocomplete="off"/>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="POP3 Host">
            <el-input v-model="importForm.popHost" autocomplete="off" placeholder="留空则按邮箱域名匹配预设配置"/>
          </el-form-item>
          <el-form-item label="POP3 Port">
            <el-input-number v-model="importForm.popPort" :min="1" :max="65535"/>
            <el-checkbox v-model="importForm.popSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
        </template>
        <el-form-item label="账号列表">
          <el-input
              v-model="importForm.content"
              type="textarea"
              :rows="8"
              placeholder="rrrfctege@aol.com----应用专用密码----4366847-4acf873f:eed4cadc-global-74672633-5m@gate.kookeey.info:1000&#10;user2@aol.com----应用专用密码"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="importForm.remark" autocomplete="off"/>
        </el-form-item>
        <el-form-item v-if="importResult.length" label="导入结果">
          <div class="import-result">
            <div v-for="item in importResult" :key="item.email" :class="item.success ? 'success' : 'error'">
              {{ item.email }}：{{ item.message }}
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="import-progress" v-if="importSaving">正在导入 {{ importProgress.done }}/{{ importProgress.total }}</span>
        <el-button @click="importShow = false" :disabled="importSaving">取消</el-button>
        <el-button type="primary" :loading="importSaving" @click="saveImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {reactive, ref, watch} from "vue";
import {
  externalAccountAdd,
  externalAccountDelete,
  externalAccountExport,
  externalAccountFavertive,
  externalAccountList,
  externalAccountSync,
  externalAccountTest,
  externalAccountUpdate
} from "@/request/external-account.js";
import {ElMessage, ElMessageBox} from "element-plus";
import {toUtc, tzDayjs} from "@/utils/day.js";

const accounts = ref([])
const loading = ref(false)
const formShow = ref(false)
const importShow = ref(false)
const saving = ref(false)
const importSaving = ref(false)
const testSaving = ref(false)
const testingId = ref(0)
const syncingId = ref(0)
const batchSyncing = ref(false)
const favertiveOnly = ref(false)
const emailKeyword = ref('')
const remarkKeyword = ref('')
const createTimeRange = ref(null)
const ownerEmail = ref('')
const importResult = ref([])
const selectedAccounts = ref([])
const importProgress = reactive({
  done: 0,
  total: 0
})

const form = reactive(defaultForm())
const importForm = reactive(defaultImportForm())
const autoFilledServer = reactive({
  protocol: '',
  host: ''
})

const incomingServerPresets = {
  'hotmail.com': {
    IMAP: {host: 'outlook.office365.com', port: 993, secure: true}
  },
  'yahoo.com': {
    IMAP: {host: 'imap.mail.yahoo.com', port: 993, secure: true}
  },
  'aol.com': {
    IMAP: {host: 'export.imap.aol.com', port: 993, secure: true}
  },
  'zoho.com': {
    IMAP: {host: 'imap.zoho.com', port: 993, secure: true},
    POP3: {host: 'pop.zoho.com', port: 995, secure: true}
  },
  'zohomail.eu': {
    IMAP: {host: 'imap.zoho.eu', port: 993, secure: true},
    POP3: {host: 'pop.zoho.eu', port: 995, secure: true}
  },
  'zohomail.in': {
    IMAP: {host: 'imap.zoho.in', port: 993, secure: true},
    POP3: {host: 'pop.zoho.in', port: 995, secure: true}
  },
  'zohomail.com.au': {
    IMAP: {host: 'imap.zoho.com.au', port: 993, secure: true},
    POP3: {host: 'pop.zoho.com.au', port: 995, secure: true}
  },
  'vfemail.net': {
    IMAP: {host: 'NL101.vfemail.net', port: 993, secure: true},
    POP3: {host: 'NL101.vfemail.net', port: 995, secure: true}
  },
  'rambler.ru': {
    IMAP: {host: 'imap.rambler.ru', port: 993, secure: true},
    POP3: {host: 'pop.rambler.ru', port: 995, secure: true}
  },
  'gmail.com': {
    IMAP: {host: 'imap.gmail.com', port: 993, secure: true}
  },
  'gmx.com': {
    IMAP: {host: 'imap.gmx.com', port: 993, secure: true}
  }
}

loadList()

watch(() => form.email, fillServerHostByEmail)
watch(() => form.protocol, fillServerHostByEmail)

function defaultForm() {
  return {
    externalAccountId: null,
    name: '',
    email: '',
    remark: '',
    protocol: 'IMAP',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapMailbox: 'INBOX',
    popHost: '',
    popPort: 995,
    popSecure: true,
    username: '',
    password: '',
    proxyHost: '',
    proxyPort: 0,
    proxyUsername: '',
    proxyPassword: ''
  }
}

function defaultImportForm() {
  return {
    protocol: 'IMAP',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapMailbox: 'INBOX',
    popHost: '',
    popPort: 995,
    popSecure: true,
    remark: '',
    content: ''
  }
}

function resetForm() {
  Object.assign(form, defaultForm())
  resetAutoFilledServer()
}

function resetImportForm() {
  Object.assign(importForm, defaultImportForm())
  importResult.value = []
  importProgress.done = 0
  importProgress.total = 0
}

function loadList() {
  loading.value = true
  externalAccountList({
    email: emailKeyword.value.trim() || undefined,
    remark: remarkKeyword.value.trim() || undefined,
    isFavertive: favertiveOnly.value ? 1 : undefined,
    ownerEmail: ownerEmail.value.trim() || undefined,
    createStartTime: createTimeRange.value ? toUtc(createTimeRange.value[0]).format('YYYY-MM-DD HH:mm:ss') : undefined,
    createEndTime: createTimeRange.value ? toUtc(createTimeRange.value[1]).add(1, 'day').format('YYYY-MM-DD HH:mm:ss') : undefined
  }).then(data => {
    accounts.value = Array.isArray(data) ? data : (data?.list || [])
    selectedAccounts.value = []
  }).finally(() => {
    loading.value = false
  })
}

function toggleFavertiveFilter() {
  favertiveOnly.value = !favertiveOnly.value
  loadList()
}

function openAdd() {
  resetForm()
  formShow.value = true
}

function openImport() {
  resetImportForm()
  importShow.value = true
}

function openEdit(row) {
  resetAutoFilledServer()
  Object.assign(form, {
    ...defaultForm(),
    ...row,
    imapSecure: !!row.imapSecure,
    popSecure: !!row.popSecure,
    password: row.password || '',
    proxyPassword: row.proxyPassword || ''
  })
  formShow.value = true
}

function getEmailDomain(email) {
  const domain = String(email || '').trim().split('@')[1]
  return domain && domain.includes('.') ? domain.toLowerCase() : ''
}

function resetAutoFilledServer() {
  autoFilledServer.protocol = ''
  autoFilledServer.host = ''
}

function getIncomingConfig(domain, protocol) {
  const preset = incomingServerPresets[domain]?.[protocol]
  if (preset) {
    return preset
  }
  if (!domain) {
    return null
  }
  return {
    host: `${protocol === 'POP3' ? 'pop' : 'imap'}.${domain}`,
    port: protocol === 'POP3' ? 995 : 993,
    secure: true
  }
}

function setIncomingConfig(target, protocol, config) {
  if (!config) {
    return
  }
  if (protocol === 'POP3') {
    target.popHost = config.host
    target.popPort = config.port
    target.popSecure = config.secure
    return
  }
  target.imapHost = config.host
  target.imapPort = config.port
  target.imapSecure = config.secure
}

function hasManualServerConfig() {
  const host = form.protocol === 'POP3' ? form.popHost : form.imapHost
  return host.trim() && (autoFilledServer.protocol !== form.protocol || autoFilledServer.host !== host)
}

function fillServerHostByEmail() {
  if (form.externalAccountId || hasManualServerConfig()) {
    return
  }
  const domain = getEmailDomain(form.email)
  if (!domain) {
    return
  }
  const config = getIncomingConfig(domain, form.protocol)
  setIncomingConfig(form, form.protocol, config)
  autoFilledServer.protocol = form.protocol
  autoFilledServer.host = config?.host || ''
}

function saveForm() {
  saving.value = true
  const request = form.externalAccountId ? externalAccountUpdate : externalAccountAdd
  request(buildFormPayload()).then(() => {
    ElMessage({message: '保存成功', type: 'success', plain: true})
    formShow.value = false
    loadList()
  }).finally(() => {
    saving.value = false
  })
}

function buildFormPayload() {
  const email = form.email.trim()
  return {
    externalAccountId: form.externalAccountId,
    email,
    remark: form.remark,
    name: email,
    protocol: form.protocol,
    imapHost: form.imapHost,
    imapPort: form.imapPort,
    imapSecure: form.imapSecure,
    imapMailbox: form.imapMailbox,
    popHost: form.popHost,
    popPort: form.popPort,
    popSecure: form.popSecure,
    username: email,
    password: form.password,
    proxyHost: form.proxyHost,
    proxyPort: form.proxyPort,
    proxyUsername: form.proxyUsername,
    proxyPassword: form.proxyPassword
  }
}

function parseImportRows() {
  return importForm.content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        let parts = line.includes('----')
            ? line.split('----')
            : line.split(/,|\t/)
        parts = parts.map(item => item.trim())
        const email = parts[0] || ''
        const password = parts[1] || ''
        const proxy = parseProxy(parts[2] || '')
        return {
          index: index + 1,
          email,
          password,
          proxyRaw: parts[2] || '',
          proxy
        }
      })
}

function parseProxy(value) {
  const text = value.trim()
  if (!text) {
    return {
      host: '',
      port: 0,
      username: '',
      password: ''
    }
  }
  const atIndex = text.lastIndexOf('@')
  const auth = atIndex > -1 ? text.slice(0, atIndex) : ''
  const hostPort = atIndex > -1 ? text.slice(atIndex + 1) : text
  const colonIndex = hostPort.lastIndexOf(':')
  const host = colonIndex > -1 ? hostPort.slice(0, colonIndex) : hostPort
  const port = colonIndex > -1 ? Number(hostPort.slice(colonIndex + 1)) : 0
  const authParts = auth.split(':')
  return {
    host,
    port,
    username: authParts[0] || '',
    password: authParts.slice(1).join(':') || ''
  }
}

function buildImportPayload(row) {
  const domain = getEmailDomain(row.email)
  const config = getIncomingConfig(domain, importForm.protocol)
  const payload = {
    ...defaultForm(),
    name: row.email,
    email: row.email,
    remark: importForm.remark,
    protocol: importForm.protocol,
    imapHost: importForm.imapHost.trim(),
    imapPort: importForm.imapPort,
    imapSecure: importForm.imapSecure,
    imapMailbox: importForm.imapMailbox,
    popHost: importForm.popHost.trim(),
    popPort: importForm.popPort,
    popSecure: importForm.popSecure,
    username: row.email,
    password: row.password,
    proxyHost: row.proxy.host,
    proxyPort: row.proxy.port,
    proxyUsername: row.proxy.username,
    proxyPassword: row.proxy.password
  }
  if (importForm.protocol === 'IMAP' && !payload.imapHost) {
    setIncomingConfig(payload, importForm.protocol, config)
  }
  if (importForm.protocol === 'POP3' && !payload.popHost) {
    setIncomingConfig(payload, importForm.protocol, config)
  }
  return {
    ...payload,
    imapHost: payload.imapHost || (domain ? `imap.${domain}` : ''),
    popHost: payload.popHost || (domain ? `pop.${domain}` : '')
  }
}

async function findExistingImportAccount(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const current = accounts.value.find(item => String(item.email || '').toLowerCase() === normalizedEmail)
  if (current) {
    return current
  }
  const data = await externalAccountList({page: 1, size: 10, keyword: email})
  const list = Array.isArray(data) ? data : (data?.list || [])
  return list.find(item => String(item.email || '').toLowerCase() === normalizedEmail)
}

async function saveImport() {
  const rows = parseImportRows()
  if (rows.length === 0) {
    ElMessage({message: '请填写账号列表', type: 'warning', plain: true})
    return
  }

  const invalid = rows.find(row => !row.email)
  if (invalid) {
    ElMessage({message: `第 ${invalid.index} 行格式错误`, type: 'error', plain: true})
    return
  }

  const invalidProxy = rows.find(row => row.proxyRaw && (!row.proxy.host || !row.proxy.port))
  if (invalidProxy) {
    ElMessage({message: `第 ${invalidProxy.index} 行代理格式错误`, type: 'error', plain: true})
    return
  }

  importSaving.value = true
  importResult.value = []
  importProgress.done = 0
  importProgress.total = rows.length

  for (const row of rows) {
    try {
      const existing = await findExistingImportAccount(row.email)
      if (existing) {
        await externalAccountUpdate({
          ...buildImportPayload(row),
          externalAccountId: existing.externalAccountId,
          isFavertive: existing.isFavertive,
          status: existing.status
        })
        importResult.value.push({email: row.email, success: true, message: '已更新'})
      } else if (!row.password) {
        importResult.value.push({email: row.email, success: false, message: '新账号必须填写密码'})
      } else {
        await externalAccountAdd(buildImportPayload(row))
        importResult.value.push({email: row.email, success: true, message: '已新增'})
      }
    } catch (e) {
      importResult.value.push({email: row.email, success: false, message: e.message || '失败'})
    } finally {
      importProgress.done++
    }
  }

  importSaving.value = false
  const successCount = importResult.value.filter(item => item.success).length
  ElMessage({message: `导入完成，成功 ${successCount} 个，失败 ${rows.length - successCount} 个`, type: successCount ? 'success' : 'error', plain: true})
  loadList()
}

function testForm() {
  testSaving.value = true
  externalAccountTest(buildFormPayload()).then(data => {
    ElMessage({message: `连接成功，邮件总数 ${data?.total ?? '-'}`, type: 'success', plain: true})
  }).finally(() => {
    testSaving.value = false
  })
}

function testAccount(row) {
  testingId.value = row.externalAccountId
  externalAccountTest({externalAccountId: row.externalAccountId}).then(data => {
    ElMessage({message: `连接成功，邮件总数 ${data?.total ?? '-'}`, type: 'success', plain: true})
    loadList()
  }).finally(() => {
    testingId.value = 0
  })
}

function syncAccount(row) {
  syncingId.value = row.externalAccountId
  externalAccountSync(row.externalAccountId, 5).then(data => {
    ElMessage({message: `同步完成，新增 ${data?.fetched || 0} 封，跳过 ${data?.skipped || 0} 封`, type: 'success', plain: true})
    loadList()
  }).finally(() => {
    syncingId.value = 0
  })
}

function syncAccountAll(row) {
  ElMessageBox.confirm(`确认全量同步 ${row.email}？耗时取决于远程邮箱邮件数量。`, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    syncingId.value = row.externalAccountId
    externalAccountSync(row.externalAccountId, 0).then(data => {
      ElMessage({message: `全量同步完成，新增 ${data?.fetched || 0} 封，跳过 ${data?.skipped || 0} 封`, type: 'success', plain: true})
      loadList()
    }).finally(() => {
      syncingId.value = 0
    })
  })
}

async function syncSelectedAccounts() {
  if (selectedAccounts.value.length === 0 || batchSyncing.value) {
    return
  }
  batchSyncing.value = true
  let success = 0
  let failed = 0
  for (const row of selectedAccounts.value) {
    try {
      await externalAccountSync(row.externalAccountId, 5)
      success++
    } catch (e) {
      console.error(e)
      failed++
    }
  }
  batchSyncing.value = false
  ElMessage({message: `批量同步完成，成功 ${success} 个，失败 ${failed} 个`, type: failed ? 'warning' : 'success', plain: true})
  loadList()
}

function toggleFavertive(row) {
  const oldValue = row.isFavertive ? 1 : 0
  const nextValue = oldValue ? 0 : 1
  row.isFavertive = nextValue
  externalAccountFavertive(row.externalAccountId, nextValue).then(() => {
    if (favertiveOnly.value && !nextValue) {
      loadList()
    }
  }).catch(() => {
    row.isFavertive = oldValue
  })
}

async function exportSelected() {
  if (selectedAccounts.value.length === 0) {
    ElMessage({message: '请先勾选要导出的账号', type: 'warning', plain: true})
    return
  }
  const ids = selectedAccounts.value.map(item => item.externalAccountId)
  const data = await externalAccountExport(ids)
  const content = data?.content || ''
  if (!content) {
    ElMessage({message: '没有可导出的账号', type: 'warning', plain: true})
    return
  }
  const blob = new Blob([content], {type: 'text/plain;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `external-accounts-${Date.now()}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

function deleteAccount(row) {
  ElMessageBox.confirm(`确认删除 ${row.email}？不会删除远程邮箱中的邮件。`, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    externalAccountDelete(row.externalAccountId).then(() => {
      ElMessage({message: '删除成功', type: 'success', plain: true})
      loadList()
    })
  })
}

function serverText(row) {
  return row.protocol === 'IMAP'
      ? `${row.imapHost}:${row.imapPort}/${row.imapMailbox || 'INBOX'}`
      : `${row.popHost}:${row.popPort}`
}

function proxyText(row) {
  return row.proxyHost ? `${row.proxyHost}:${row.proxyPort}` : '-'
}

function formatSyncTime(time) {
  return time ? tzDayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function statusText(status) {
  const map = {
    normal: '正常',
    disabled: '禁用',
    test_failed: '测试失败',
    sync_failed: '同步失败',
    proxy_failed: '代理失败',
    login_failed: '登录失败',
    security_check_required: '风控异常'
  }
  return map[status] || status
}
</script>

<style scoped lang="scss">
.external-account-page {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  .icon {
    cursor: pointer;
    &.disabled {
      opacity: 0.35;
      pointer-events: none;
    }
    &.syncing {
      animation: sync-rotate 0.8s linear infinite;
    }
  }
}

@keyframes sync-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.star-icon {
  cursor: pointer;
}

.favorite-filter {
  flex: 0 0 auto;
}

.keyword-input {
  width: 220px;
}

.remark-input {
  width: 180px;
}

.create-time-range {
  width: 230px;
}

.owner-select {
  width: 190px;
}

.table-scrollbar {
  height: calc(100% - 42px);
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sync-result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  .error {
    color: var(--el-color-danger);
  }
}

.account-form {
  padding-right: 20px;
}

.secure-check {
  margin-left: 16px;
}

.import-tip {
  margin-bottom: 16px;
}

.import-form {
  .import-result {
    width: 100%;
    max-height: 160px;
    overflow: auto;
    line-height: 1.8;
    font-size: 13px;
    .success {
      color: var(--el-color-success);
    }
    .error {
      color: var(--el-color-danger);
    }
  }
}

.import-progress {
  margin-right: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

@media (max-width: 767px) {
  :deep(.el-dialog) {
    width: calc(100vw - 24px) !important;
  }
  .account-form {
    padding-right: 0;
  }
}
</style>
