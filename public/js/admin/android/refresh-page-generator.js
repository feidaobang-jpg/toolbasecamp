// 下拉刷新分页代码生成器功能
document.addEventListener('DOMContentLoaded', function() {
    initButtonEvents();
});

function initButtonEvents() {
    const generateBtn = document.getElementById('generate-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    // 生成按钮事件
    generateBtn.addEventListener('click', generateCode);
    
    // 清空按钮事件
    clearBtn.addEventListener('click', function() {
        clearCodeContent(['layout-output', 'main-class-output']);
    });
}

function generateCode() {
    // 生成布局代码
    const layoutCode = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@color/white"
    android:orientation="vertical">
    <include layout="@layout/view_toolbar" />
    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent">
        <include layout="@layout/view_recycler" />
        <LinearLayout
            android:id="@+id/no_data"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:layout_gravity="center"
            android:visibility="gone">
            <ImageView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_gravity="center"
                android:background="@mipmap/icon_no_demo"/>
        </LinearLayout>
    </FrameLayout>
</LinearLayout>`;

    // 生成主类代码
    const mainClassCode = `    @BindView(R.id.no_data)
    LinearLayout no_data;
    private DemoAdapter mDemoAdapter;
    private int mCurrent = 1;

    @Override
    protected RecyclerView.Adapter<ViewHolder> getAdapter() {
        mDemoAdapter = new DemoAdapter(mContext, new ArrayList<CourseReportsBean.RecordsBean>());
        return mDemoAdapter;
    }

    @Override
    protected CoobyApi getApiAction() {
        if (isMore()){
            mCurrent = mCurrent + 1;
        }else {
            mCurrent = 1;
        }
        DemoApi mDemoApi = new DemoApi(mOnHttpListener,this);
        mDemoApi.setCurrent(mCurrent);
        return mDemoApi;
    }

    @Override
    protected void postSuccess(CourseReportsBean result) {
        if (isMore()){
            mDemoAdapter.addList(result.getRecords());
        }else {
            if (result.getRecords() == null || result.getRecords().size() == 0){
                no_data.setVisibility(View.VISIBLE);
            }else {
                no_data.setVisibility(View.GONE);
            }
            mDemoAdapter.setList(result.getRecords());
        }
    }`;

    // 使用公共函数设置代码内容
    setCodeContent('layout-output', layoutCode);
    setCodeContent('main-class-output', mainClassCode);
} 