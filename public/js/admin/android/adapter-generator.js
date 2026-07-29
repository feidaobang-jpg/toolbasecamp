// Adapter代码生成器功能
document.addEventListener('DOMContentLoaded', function() {
    // 初始化事件
    initButtonEvents();
});

function initButtonEvents() {
    const generateBtn = document.getElementById('generate-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtns = document.querySelectorAll('.copy-btn');
    
    // 生成按钮事件
    generateBtn.addEventListener('click', generateAdapterCode);
    
    // 清空按钮事件
    clearBtn.addEventListener('click', function() {
        document.getElementById('adapter-output').textContent = '';
    });
    
    // 复制按钮事件
    copyBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const codeElement = document.getElementById(targetId);
            
            // 创建一个临时文本区域来复制内容
            const tempTextArea = document.createElement('textarea');
            tempTextArea.value = codeElement.textContent;
            document.body.appendChild(tempTextArea);
            tempTextArea.select();
            document.execCommand('copy');
            document.body.removeChild(tempTextArea);
            
            // 显示复制成功提示
            const originalText = this.innerText;
            this.innerText = '已复制!';
            setTimeout(() => {
                this.innerText = originalText;
            }, 1500);
        });
    });
}

function generateAdapterCode() {
    const zbaseChecked = document.getElementById('zbase-adapter').checked;
    const recyclerChecked = document.getElementById('recycler-adapter').checked;
    const outputArea = document.getElementById('adapter-output');
    
    let code = '';
    
    if (zbaseChecked) {
        code = `public class DemoAdapter extends ZBaseAdapter<String> {


    public DemoAdapter(Context context) {
        super(context);
    }

    @Override
    protected ViewHolder createViewHolder() {
        return new MyViewHolder();
    }

    private class MyViewHolder extends ViewHolder {



        @Override
        public int inflateMainLayoutId() {
            return R.layout.adapter_demo;
        }

        @Override
        public void initView(View view) {

        }

        @Override
        public void initData() {

        }

        @Override
        public void initEvent() {

        }

        @Override
        public void onClick(View v) {

        }
    }
}`;
    } else if (recyclerChecked) {
        code = `public class DemoAdapter extends BaseRecyclerviewAdapter<String> {

    public DemoAdapter(Context context, List<String> mList) {
        super(context,mList);
    }

    @Override
    protected ViewHolder getViewHolder(ViewGroup parent, int viewType) {
        return new MyViewHolder(LayoutInflater.from(mContext).inflate(R.layout.adapter_demo, parent, false));
    }

    @Override
    protected void onBindView(ViewHolder holder, int position) {

    }

    @Override
    public void onBindViewHolder(ViewHolder holder, int position) {
        if (holder instanceof MyViewHolder) {
            ((MyViewHolder) holder).bindViewHolder(position);
        }
    }

    private class MyViewHolder extends ViewHolder {


        public MyViewHolder(View view) {
            super(view);
            
        }

        public void bindViewHolder(final int position) {
      
        }

    }

}`;
    }
    
    outputArea.textContent = code;
} 