<script setup lang="ts">
import type { FollowConfig } from "@/types/order";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { onMounted, reactive, ref } from "vue";
import { getUsers } from "@/api/esport";
import { useConfigStore } from "@/stores/configStore";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const configStore = useConfigStore();
const { follow } = storeToRefs(user);

let form = reactive<FollowConfig>({
  isOpen: false,
  betMoney: 100,
  minMoney: 0,
  maxMoney: 0,
  odds: 0,
  users: [],
});

const publishers = ref<{ userId: number; userName: string }[]>([]);
const saving = ref(false);

onMounted(async () => {
  await user.loadExtras();
  if (follow.value) {
    Object.assign(form, follow.value);
    form.users = [...(follow.value.users ?? follow.value.publishers ?? [])];
  }
  else {
    form.betMoney = configStore.config.betMoney;
  }
  try {
    const users = await getUsers();
    publishers.value = (users ?? [])
      .filter(u => Boolean(u.Setting?.Publisher))
      .map(u => ({
        userId: Number(u.Id ?? u.UserID ?? 0),
        userName: u.UserName ?? String(u.Id ?? ""),
      }));
  }
  catch {
    /* ignore */
  }
});

async function save() {
  saving.value = true;
  try {
    const payload: FollowConfig = {
      ...form,
      users: [...(form.users ?? [])],
      publishers: [...(form.users ?? [])],
    };
    await user.saveFollowConfig(payload);
    ElMessage.success("保存成功");
  }
  finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-form class="user-diag-follow">
    <el-row :gutter="20">
      <el-col :span="24">
        <el-form-item>
          <el-switch
            v-model="form.isOpen"
            size="large"
            inline-prompt
            active-text="跟单开关"
            inactive-text="跟单开关"
          />
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="跟单金额：">
          <el-input v-model.number="form.betMoney" type="number" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="有效金额：">
          <el-row>
            <el-col :span="10">
              <el-input v-model.number="form.minMoney" type="number" />
            </el-col>
            <el-col :span="2" class="text-gray-500">
              -
            </el-col>
            <el-col :span="10">
              <el-input v-model.number="form.maxMoney" type="number" />
            </el-col>
          </el-row>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="跟单赔率：">
          <el-input v-model.number="form.odds" type="number" />
        </el-form-item>
      </el-col>
      <el-col v-if="publishers.length" :span="24">
        <el-form-item label="跟单对象：">
          <el-checkbox-group v-model="form.users">
            <el-checkbox v-for="p in publishers" :key="p.userId" :value="p.userId">
              {{ p.userName }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-col>
      <el-col :span="24">
        <el-button type="primary" class="am-icon-save" :loading="saving" @click="save">
          &nbsp;保存配置
        </el-button>
      </el-col>
    </el-row>
  </el-form>
</template>
