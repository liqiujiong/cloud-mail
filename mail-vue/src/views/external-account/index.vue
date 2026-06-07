<template>
  <div class="external-account-page">
    <div class="header-actions">
      <Icon v-perm="'external-account:add'" class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <Icon v-perm="'external-account:add'" class="icon" icon="solar:import-outline" width="21" height="21" @click="openImport"/>
      <Icon v-perm="'external-account:query'" class="icon" :class="{disabled: selectedAccounts.length === 0}" icon="ion:download-outline" width="20" height="20" @click="exportSelected"/>
      <Icon v-perm="'external-account:sync'" class="icon" :class="{disabled: selectedAccounts.length === 0 || batchSyncing, syncing: batchSyncing}" icon="ion:sync-outline" width="19" height="19" @click="syncSelectedAccounts"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="loadList"/>
      <Icon
          class="icon favorite-filter"
          :icon="favertiveOnly ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
          width="20"
          height="20"
          @click="toggleFavertiveFilter"
      />
      <el-button v-perm="'external-account:set'" size="small" @click="openBatchMark">批量标记</el-button>
      <el-input
          v-model="emailKeyword"
          class="keyword-input"
          placeholder="精准搜索邮箱，空格分隔"
          clearable
          @keyup.enter="searchList"
          @clear="searchList"
      />
      <el-input
          v-model="remarkKeyword"
          class="remark-input"
          placeholder="搜索备注"
          clearable
          @keyup.enter="searchList"
          @clear="searchList"
      />
      <el-select
          v-model="statusFilter"
          class="status-select"
          placeholder="状态"
          clearable
          @change="searchList"
          @clear="searchList"
      >
        <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value"/>
      </el-select>
      <el-date-picker
          v-model="createTimeRange"
          class="create-time-range"
          type="daterange"
          unlink-panels
          start-placeholder="添加开始"
          end-placeholder="添加结束"
          @change="searchList"
      />
      <el-input
          v-model="ownerEmail"
          class="owner-select"
          placeholder="归属用户"
          clearable
          @keyup.enter="searchList"
          @clear="searchList"
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
        <el-table-column label="原始邮箱" prop="originalEmail" min-width="210" show-overflow-tooltip/>
        <el-table-column label="备注" prop="remark" min-width="150" show-overflow-tooltip/>
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
    <div class="pagination-bar">
      <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.size"
          :page-sizes="[20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handlePageSizeChange"
          @current-change="loadList"
      />
    </div>

    <el-dialog v-model="formShow" :title="form.externalAccountId ? '编辑外部邮箱' : '添加外部邮箱'" width="620px" @closed="resetForm">
      <el-form label-width="110px" class="account-form">
        <el-form-item label="邮箱地址">
          <el-input v-model="form.email" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="原始邮箱">
          <el-input v-model="form.originalEmail" autocomplete="off" placeholder="留空默认跟邮箱地址一致"/>
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

    <el-dialog v-model="importShow" width="960px" class="import-dialog" :show-close="false" @closed="resetImportForm">
      <template #header>
        <div class="import-header">
          <div class="import-title">导入外部邮箱</div>
          <el-segmented v-model="importStep" :options="importStepOptions"/>
          <el-button class="import-close" text @click="importShow = false">
            <Icon icon="ion:close-outline" width="24" height="24"/>
          </el-button>
        </div>
      </template>
      <div class="import-panel">
        <div class="import-config-grid">
          <label class="import-field">
            <span>批量备注</span>
            <el-input v-model="importForm.remark" autocomplete="off" placeholder="例如：0603 Discord 登录补录"/>
          </label>
          <label class="import-field">
            <span>协议</span>
            <el-segmented v-model="importForm.protocol" :options="['IMAP', 'POP3']"/>
          </label>
          <label class="import-field" v-if="importForm.protocol === 'IMAP'">
            <span>IMAP Host</span>
            <el-input v-model="importForm.imapHost" autocomplete="off" placeholder="留空按邮箱域名匹配"/>
          </label>
          <label class="import-field" v-else>
            <span>POP3 Host</span>
            <el-input v-model="importForm.popHost" autocomplete="off" placeholder="留空按邮箱域名匹配"/>
          </label>
          <label class="import-field compact-field" v-if="importForm.protocol === 'IMAP'">
            <span>IMAP Port</span>
            <div class="import-port-row">
              <el-input-number v-model="importForm.imapPort" :min="1" :max="65535"/>
              <el-checkbox v-model="importForm.imapSecure">SSL</el-checkbox>
            </div>
          </label>
          <label class="import-field compact-field" v-else>
            <span>POP3 Port</span>
            <div class="import-port-row">
              <el-input-number v-model="importForm.popPort" :min="1" :max="65535"/>
              <el-checkbox v-model="importForm.popSecure">SSL</el-checkbox>
            </div>
          </label>
          <label class="import-field compact-field" v-if="importForm.protocol === 'IMAP'">
            <span>文件夹</span>
            <el-input v-model="importForm.imapMailbox" autocomplete="off"/>
          </label>
        </div>
        <div class="import-stat-grid">
          <div class="import-stat">总行 <b>{{ importStats.total }}</b></div>
          <div class="import-stat success">有效 <b>{{ importStats.valid }}</b></div>
          <div class="import-stat warning">异常 <b>{{ importStats.invalid }}</b></div>
        </div>
        <template v-if="importStep === 1">
          <label class="import-text-label">粘贴文本</label>
          <el-input
              v-model="importForm.content"
              class="import-textarea"
              type="textarea"
              :rows="13"
              placeholder="user@example.com----应用专用密码----user:pass@gate.example.com:1000&#10;user2@example.com----应用专用密码"
          />
          <div class="import-help">支持 “----”、多个横线、Tab、逗号或空白分隔。下一步可把每一列映射到账号字段，不再要求原始文本完全按固定格式。</div>
        </template>
        <template v-else-if="importStep === 2">
          <el-table class="mapping-table" :data="importMappingRows" border>
            <el-table-column label="列" width="110">
              <template #default="props">第 {{ props.row.column }} 列</template>
            </el-table-column>
            <el-table-column label="映射字段" width="230">
              <template #default="props">
                <el-select v-model="importMappings[props.row.index]" placeholder="选择字段">
                  <el-option v-for="item in importFieldOptions" :key="item.value" :label="item.label" :value="item.value"/>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="样例值" prop="sample" show-overflow-tooltip/>
          </el-table>
          <div class="mapping-status" :class="{error: !importMappingReady}">
            {{ importMappingReady ? '映射可用' : '必须映射邮箱和密码字段' }}
          </div>
        </template>
        <template v-else>
          <div class="import-stat-grid preview-stats">
            <div class="import-stat">批次 <b>自动生成</b></div>
            <div class="import-stat success">待导入 <b>{{ importStats.valid }}</b></div>
            <div class="import-stat warning">预检异常 <b>{{ importStats.invalid }}</b></div>
            <div class="import-stat">后端错误 / 跳过 <b>{{ importBackendFailed }} / {{ importBackendSkipped }}</b></div>
          </div>
          <el-table class="preview-table" :data="importPreviewRows" border>
            <el-table-column label="行" prop="index" width="70"/>
            <el-table-column label="邮箱" prop="email" min-width="210" show-overflow-tooltip/>
            <el-table-column label="原始邮箱" prop="originalEmail" min-width="210" show-overflow-tooltip/>
            <el-table-column label="密码" width="100">
              <template #default="props">{{ props.row.password ? '已填' : '-' }}</template>
            </el-table-column>
            <el-table-column label="代理" prop="proxyRaw" min-width="210" show-overflow-tooltip/>
            <el-table-column label="备注" prop="remark" min-width="170" show-overflow-tooltip/>
            <el-table-column label="状态" min-width="180">
              <template #default="props">
                <span :class="props.row.valid ? 'success' : 'error'">{{ props.row.message }}</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="importResult.length" class="import-result">
            <div v-for="item in importResult" :key="item.email" :class="item.success ? 'success' : 'error'">
              {{ item.email }}：{{ item.message }}
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <span class="import-progress" v-if="importSaving">正在导入 {{ importProgress.done }}/{{ importProgress.total }}</span>
        <span class="import-progress" v-else-if="importSyncing">后台同步 {{ importSyncProgress.done }}/{{ importSyncProgress.total }}</span>
        <el-button @click="importShow = false">取消</el-button>
        <el-button v-if="importStep > 1" :disabled="importSaving" @click="prevImportStep">上一步</el-button>
        <el-button v-if="importStep < 3" type="primary" :disabled="!canGoNextImportStep" @click="nextImportStep">下一步</el-button>
        <el-button v-else type="primary" :loading="importSaving" :disabled="importSaving || importPreviewRows.length === 0 || importStats.invalid > 0" @click="saveImport">确认导入</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="batchMarkShow" title="批量标记外部邮箱" width="560px" @closed="resetBatchMarkForm">
      <el-alert
          class="import-tip"
          type="info"
          show-icon
          :closable="false"
          title="每行一个邮箱，执行后会批量设为收藏。也支持从表格或文件中复制多行邮箱。"
      />
      <el-form label-width="90px" class="account-form">
        <el-form-item label="邮箱列表">
          <el-input
              v-model="batchMarkForm.content"
              type="textarea"
              :rows="10"
              placeholder="user1@yahoo.com&#10;user2@yahoo.com"
          />
        </el-form-item>
        <el-form-item v-if="batchMarkResult" label="执行结果">
          <div class="import-result">
            <div class="success">已标记 {{ batchMarkResult.updated }} 个，输入 {{ batchMarkResult.total }} 个</div>
            <div v-if="batchMarkResult.missing.length" class="error">
              未找到：{{ batchMarkResult.missing.join('、') }}
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchMarkShow = false" :disabled="batchMarkSaving">取消</el-button>
        <el-button type="primary" :loading="batchMarkSaving" @click="saveBatchMark">执行标记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {computed, reactive, ref, watch} from "vue";
import {
  externalAccountAdd,
  externalAccountDelete,
  externalAccountExport,
  externalAccountFavertive,
  externalAccountFavertiveBatch,
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
const batchMarkShow = ref(false)
const importStep = ref(1)
const saving = ref(false)
const importSaving = ref(false)
const importSyncing = ref(false)
const batchMarkSaving = ref(false)
const testSaving = ref(false)
const testingId = ref(0)
const syncingId = ref(0)
const batchSyncing = ref(false)
const favertiveOnly = ref(false)
const emailKeyword = ref('')
const remarkKeyword = ref('')
const statusFilter = ref('')
const createTimeRange = ref(null)
const ownerEmail = ref('')
const importResult = ref([])
const batchMarkResult = ref(null)
const selectedAccounts = ref([])
const importMappings = ref([])
const importProgress = reactive({
  done: 0,
  total: 0
})
const importSyncProgress = reactive({
  done: 0,
  total: 0
})
let importRunId = 0
const pagination = reactive({
  page: 1,
  size: 50,
  total: 0
})

const statusOptions = [
  {label: '正常', value: 'normal'},
  {label: '禁用', value: 'disabled'},
  {label: '测试失败', value: 'test_failed'},
  {label: '同步失败', value: 'sync_failed'},
  {label: '代理失败', value: 'proxy_failed'},
  {label: '登录失败', value: 'login_failed'},
  {label: '风控异常', value: 'security_check_required'}
]

const importStepOptions = [
  {label: '1. 粘贴文本', value: 1},
  {label: '2. 字段映射', value: 2},
  {label: '3. 预览确认', value: 3}
]

const importFieldOptions = [
  {label: '忽略', value: ''},
  {label: '邮箱 *', value: 'email'},
  {label: '原始邮箱', value: 'originalEmail'},
  {label: '密码 *', value: 'password'},
  {label: 'SOCKS5 代理', value: 'proxy'},
  {label: '备注', value: 'remark'}
]

const form = reactive(defaultForm())
const importForm = reactive(defaultImportForm())
const batchMarkForm = reactive({
  content: ''
})
const autoFilledServer = reactive({
  protocol: '',
  host: ''
})

const importRawRows = computed(() => parseImportRawRows())
const importMappingRows = computed(() => {
  const maxColumn = importRawRows.value.reduce((max, row) => Math.max(max, row.columns.length), 0)
  return Array.from({length: maxColumn}, (_, index) => {
    const sampleRow = importRawRows.value.find(row => row.columns[index])
    return {
      index,
      column: index + 1,
      sample: sampleRow?.columns[index] || '-'
    }
  })
})
const importPreviewRows = computed(() => importRawRows.value.map(toImportPreviewRow))
const importStats = computed(() => {
  const total = importRawRows.value.length
  const valid = importPreviewRows.value.filter(row => row.valid).length
  return {
    total,
    valid,
    invalid: total - valid
  }
})
const importMappingReady = computed(() => importMappings.value.includes('email') && importMappings.value.includes('password'))
const canGoNextImportStep = computed(() => {
  if (importStep.value === 1) {
    return importStats.value.total > 0
  }
  if (importStep.value === 2) {
    return importMappingReady.value
  }
  return false
})
const importBackendFailed = computed(() => importResult.value.filter(item => !item.success).length)
const importBackendSkipped = computed(() => importPreviewRows.value.filter(item => !item.valid).length)

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
watch(() => importForm.content, syncDefaultImportMappings)

function defaultForm() {
  return {
    externalAccountId: null,
    name: '',
    email: '',
    originalEmail: '',
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
  importRunId++
  Object.assign(importForm, defaultImportForm())
  importStep.value = 1
  importMappings.value = []
  importResult.value = []
  importProgress.done = 0
  importProgress.total = 0
  importSyncing.value = false
  importSyncProgress.done = 0
  importSyncProgress.total = 0
}

function resetBatchMarkForm() {
  batchMarkForm.content = ''
  batchMarkResult.value = null
}

function loadList() {
  loading.value = true
  externalAccountList({
    page: pagination.page,
    size: pagination.size,
    email: emailKeyword.value.trim() || undefined,
    remark: remarkKeyword.value.trim() || undefined,
    status: statusFilter.value || undefined,
    isFavertive: favertiveOnly.value ? 1 : undefined,
    ownerEmail: ownerEmail.value.trim() || undefined,
    createStartTime: createTimeRange.value ? toUtc(createTimeRange.value[0]).format('YYYY-MM-DD HH:mm:ss') : undefined,
    createEndTime: createTimeRange.value ? toUtc(createTimeRange.value[1]).add(1, 'day').format('YYYY-MM-DD HH:mm:ss') : undefined
  }).then(data => {
    accounts.value = Array.isArray(data) ? data : (data?.list || [])
    pagination.total = Array.isArray(data) ? accounts.value.length : (data?.total || 0)
    selectedAccounts.value = []
  }).finally(() => {
    loading.value = false
  })
}

function searchList() {
  pagination.page = 1
  loadList()
}

function handlePageSizeChange() {
  pagination.page = 1
  loadList()
}

function toggleFavertiveFilter() {
  favertiveOnly.value = !favertiveOnly.value
  searchList()
}

function openAdd() {
  resetForm()
  formShow.value = true
}

function openImport() {
  resetImportForm()
  importShow.value = true
}

function openBatchMark() {
  resetBatchMarkForm()
  batchMarkShow.value = true
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

async function saveForm() {
  saving.value = true
  const request = form.externalAccountId ? externalAccountUpdate : externalAccountAdd
  try {
    const isAdd = !form.externalAccountId
    const data = await request(buildFormPayload())
    if (isAdd && data?.externalAccountId) {
      ElMessage({message: '保存成功，正在同步邮件', type: 'success', plain: true})
      try {
        const syncData = await syncAfterSave(data.externalAccountId)
        ElMessage({message: `同步完成，新增 ${syncData?.fetched || 0} 封，跳过 ${syncData?.skipped || 0} 封`, type: 'success', plain: true})
      } catch (e) {
        ElMessage({message: `账号已保存，同步失败：${e.message || '失败'}`, type: 'warning', plain: true})
      }
    } else {
      ElMessage({message: '保存成功', type: 'success', plain: true})
    }
    formShow.value = false
    loadList()
  } finally {
    saving.value = false
  }
}

function buildFormPayload() {
  const email = form.email.trim()
  return {
    externalAccountId: form.externalAccountId,
    email,
    originalEmail: form.originalEmail.trim() || email,
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

function splitImportColumns(line) {
  if (line.includes('\t')) {
    return line.split('\t')
  }
  if (/-{2,}|—{2,}/.test(line)) {
    return line.split(/-{2,}|—{2,}/)
  }
  if (line.includes(',') || line.includes('，')) {
    return line.split(/,|，/)
  }
  return line.split(/\s+/)
}

function parseImportRawRows() {
  return importForm.content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        return {
          index: index + 1,
          raw: line,
          columns: splitImportColumns(line).map(item => item.trim())
        }
      })
}

function syncDefaultImportMappings() {
  const maxColumn = importRawRows.value.reduce((max, row) => Math.max(max, row.columns.length), 0)
  const defaults = ['email', 'password', 'proxy', 'remark']
  importMappings.value = Array.from({length: maxColumn}, (_, index) => importMappings.value[index] ?? defaults[index] ?? '')
}

function importMappedValue(rawRow, field) {
  const columnIndex = importMappings.value.findIndex(item => item === field)
  return columnIndex > -1 ? (rawRow.columns[columnIndex] || '').trim() : ''
}

function toImportPreviewRow(rawRow) {
  const email = importMappedValue(rawRow, 'email')
  const originalEmail = importMappedValue(rawRow, 'originalEmail')
  const password = importMappedValue(rawRow, 'password')
  const proxyRaw = importMappedValue(rawRow, 'proxy')
  const remark = importMappedValue(rawRow, 'remark')
  const proxy = parseProxy(proxyRaw)
  let message = '可导入'
  if (!email) {
    message = '缺少邮箱'
  } else if (!password) {
    message = '缺少密码'
  } else if (proxyRaw && (!proxy.host || !proxy.port)) {
    message = '代理格式错误'
  }
  return {
    index: rawRow.index,
    email,
    originalEmail: originalEmail || email,
    password,
    proxyRaw,
    proxy,
    remark,
    valid: message === '可导入',
    message
  }
}

function parseImportRows() {
  return importPreviewRows.value.filter(row => row.valid)
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

function parseEmailTokens(value) {
  return [...new Set(String(value || '')
      .split(/\s+/)
      .map(item => item.trim())
      .filter(Boolean)
  )]
}

function buildImportPayload(row) {
  const domain = getEmailDomain(row.email)
  const config = getIncomingConfig(domain, importForm.protocol)
  const payload = {
    ...defaultForm(),
    name: row.email,
    email: row.email,
    originalEmail: row.originalEmail || row.email,
    remark: row.remark || importForm.remark,
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
  const runId = ++importRunId
  const rows = parseImportRows()
  if (rows.length === 0) {
    ElMessage({message: '没有可导入的账号', type: 'warning', plain: true})
    return
  }

  if (importStats.value.invalid > 0) {
    ElMessage({message: '存在预检异常，请先修正映射或文本', type: 'warning', plain: true})
    return
  }

  importSaving.value = true
  importSyncing.value = false
  importResult.value = []
  importProgress.done = 0
  importProgress.total = rows.length
  importSyncProgress.done = 0
  importSyncProgress.total = 0
  const syncTargets = []

  for (const row of rows) {
    try {
      const existing = await findExistingImportAccount(row.email)
      let data
      if (existing) {
        data = await externalAccountUpdate({
          ...buildImportPayload(row),
          externalAccountId: existing.externalAccountId,
          isFavertive: existing.isFavertive,
          status: existing.status
        })
        importResult.value.push({email: row.email, success: true, message: '已更新，后台同步中'})
      } else if (!row.password) {
        importResult.value.push({email: row.email, success: false, message: '新账号必须填写密码'})
      } else {
        data = await externalAccountAdd(buildImportPayload(row))
        importResult.value.push({email: row.email, success: true, message: '已新增，后台同步中'})
      }
      if (data?.externalAccountId) {
        syncTargets.push({externalAccountId: data.externalAccountId, email: row.email})
      }
    } catch (e) {
      importResult.value.push({email: row.email, success: false, message: e.message || '失败'})
    } finally {
      importProgress.done++
    }
  }

  importSaving.value = false
  const successCount = importResult.value.filter(item => item.success).length
  const syncText = syncTargets.length ? '；后台同步已开始' : ''
  ElMessage({message: `导入完成，成功 ${successCount} 个，失败 ${rows.length - successCount} 个${syncText}`, type: successCount ? 'success' : 'warning', plain: true})
  loadList()
  runImportSyncQueue(syncTargets, runId)
}

async function runImportSyncQueue(targets, runId) {
  const queue = [...targets]
  if (!queue.length) {
    return
  }
  const isCurrentRun = () => importRunId === runId
  importSyncing.value = true
  importSyncProgress.done = 0
  importSyncProgress.total = queue.length
  let syncSuccess = 0
  let syncFailed = 0
  for (const target of queue) {
    const resultItem = isCurrentRun()
        ? importResult.value.find(item => item.email === target.email && item.success)
        : null
    try {
      const data = await syncAfterSave(target.externalAccountId)
      syncSuccess++
      if (resultItem) {
        resultItem.message = `${resultItem.message.replace('，后台同步中', '')}，同步新增 ${data?.fetched || 0} 封`
      }
    } catch (e) {
      syncFailed++
      if (resultItem) {
        resultItem.message = `${resultItem.message.replace('，后台同步中', '')}，同步失败：${e.message || '失败'}`
      }
    } finally {
      if (isCurrentRun()) {
        importSyncProgress.done++
      }
    }
  }
  if (isCurrentRun()) {
    importSyncing.value = false
    ElMessage({message: `后台同步完成，成功 ${syncSuccess} 个，失败 ${syncFailed} 个`, type: syncFailed ? 'warning' : 'success', plain: true})
    loadList()
  }
}

function syncAfterSave(externalAccountId) {
  return externalAccountSync(externalAccountId, 5)
}

function nextImportStep() {
  if (!canGoNextImportStep.value) {
    return
  }
  if (importStep.value === 1) {
    syncDefaultImportMappings()
  }
  importStep.value = Math.min(importStep.value + 1, 3)
}

function prevImportStep() {
  importStep.value = Math.max(importStep.value - 1, 1)
}

async function saveBatchMark() {
  const emails = parseEmailTokens(batchMarkForm.content)
  if (emails.length === 0) {
    ElMessage({message: '请填写邮箱列表', type: 'warning', plain: true})
    return
  }
  batchMarkSaving.value = true
  batchMarkResult.value = null
  externalAccountFavertiveBatch(emails, 1).then(data => {
    batchMarkResult.value = {
      total: data?.total || emails.length,
      updated: data?.updated || 0,
      missing: data?.missing || []
    }
    ElMessage({message: `批量标记完成，成功 ${batchMarkResult.value.updated} 个`, type: 'success', plain: true})
    loadList()
  }).finally(() => {
    batchMarkSaving.value = false
  })
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
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
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
  width: 180px;
}

.remark-input {
  width: 150px;
}

.status-select {
  width: 120px;
}

.create-time-range {
  width: 220px;
}

.owner-select {
  width: 160px;
}

.table-scrollbar {
  height: calc(100% - 136px);
}

.pagination-bar {
  height: 52px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0 15px;
  box-shadow: var(--header-actions-border);
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

.import-dialog {
  :deep(.el-dialog__header) {
    padding: 0;
    margin: 0;
  }
  :deep(.el-dialog__body) {
    padding: 0;
  }
  :deep(.el-dialog__footer) {
    padding: 16px 24px;
    border-top: 1px solid var(--el-border-color-lighter);
  }
}

.import-header {
  height: 70px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.import-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.import-close {
  margin-left: auto;
  width: 42px;
  height: 42px;
  border: 1px solid var(--el-border-color);
}

.import-panel {
  padding: 22px 24px 24px;
}

.import-config-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 150px minmax(220px, 0.8fr);
  gap: 14px;
  align-items: end;
}

.import-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-width: 0;
}

.compact-field {
  min-width: 130px;
}

.import-port-row {
  display: flex;
  align-items: center;
  gap: 10px;
  :deep(.el-input-number) {
    width: 120px;
  }
}

.import-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.preview-stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 0;
}

.import-stat {
  min-height: 46px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-weight: 600;
  &.success {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
  }
  &.warning {
    color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
  }
}

.import-text-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.import-textarea {
  :deep(.el-textarea__inner) {
    min-height: 330px !important;
    font-size: 15px;
    line-height: 1.6;
  }
}

.import-help {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.mapping-table,
.preview-table {
  width: 100%;
  margin-top: 8px;
}

.mapping-status {
  margin-top: 12px;
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 4px;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  font-weight: 600;
  &.error {
    color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
  }
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

.import-result {
  margin-top: 14px;
  max-height: 150px;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  line-height: 1.8;
  font-size: 13px;
}

.success {
  color: var(--el-color-success);
}

.error {
  color: var(--el-color-danger);
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
  .import-config-grid,
  .import-stat-grid,
  .preview-stats {
    grid-template-columns: 1fr;
  }
}
</style>
