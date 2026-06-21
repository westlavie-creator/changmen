<script setup lang="ts">
import type { MonthReportPayload } from "@/types/monthReport";
import { onMounted, ref } from "vue";
import { monthReport } from "@/api/esport";
import MonthReportTable from "@/components/report/MonthReportTable.vue";

const month = ref(new Date().toISOString().slice(0, 7));
const loading = ref(false);
const report = ref<MonthReportPayload | null>(null);

async function load() {
  loading.value = true;
  try {
    report.value = (await monthReport(month.value)) as MonthReportPayload;
  }
  finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <el-form>
    <el-form-item>
      <el-date-picker
        v-model="month"
        type="month"
        placeholder="Pick a month"
        value-format="YYYY-MM"
        @change="load"
      />
    </el-form-item>
  </el-form>

  <MonthReportTable
    variant="a8"
    :list="report?.list ?? []"
    :total="report?.total ?? null"
    :loading="loading"
  />
</template>
